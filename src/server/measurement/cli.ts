import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { PROVIDER_KEY_FILE } from "../../lib/env-guard.ts";
import { createCloudflareChatModel } from "../ai/cloudflare.ts";
import { createCloudflareEmbedder } from "../ai/cloudflare-embedder.ts";
import { createFakeChatModel } from "../ai/fake-chat-model.ts";
import { createFakeEmbedder } from "../ai/fake-embedder.ts";
import { EMBEDDING_MODEL } from "../ai/models.ts";
import { MEASUREMENTS_DIR } from "./records.ts";
import { gitIn, writeReport } from "./report.ts";
import { REQUESTS, findRequest, type RequestName } from "./requests.ts";
import {
  runBatch,
  type BatchEnvironment,
  type BatchOptions,
  type Target,
} from "./runner.ts";
import { findRule } from "./score.ts";

// `npm run measure` (scripts/measure.ts): the measurement on the real model
// and the real search, with this machine's token from `.env.development.local`
// (docs/decisions.md, External services, 2026-10-19). The token is read here,
// handed to the Cloudflare adapters and to the record check, and never
// printed, logged or put in the environment, so no child process (`git`, in
// the setup) inherits it. `npm run measure:fake` runs the same tool on the
// fake model and the fake embedder, with no token, into its own folder.

/** The fake batches' folder, apart from the real measurements and their ledger. */
export const FAKE_MEASUREMENTS_DIR = "docs/records/measurements-fake";

export const USAGE = `Usage: npm run measure -- --name <measurement> --purpose "<why>" [options]

  --name <measurement>     baseline, or a name for one change, such as prompt-v4
  --purpose "<why>"        the baseline, or the change and its expected effect
  --runs <n>               runs per request, from 1 (default 5)
  --requests A,B,C1,...    which requests (default all: ${REQUESTS.map((request) => request.name).join(",")})
  --conversations-from <m> start C2, D and E from measurement m's saved conversations
                           (default: the compared measurement's, else its own)
  --compare-with <m>       the measurement this change is compared with, such as baseline
  --target <request:rule>  the rule the change should improve, such as D:no-claim;
                           repeat it for more; needed with --compare-with
  --plan                   print what it would send and cost; send nothing`;

export const REPORT_USAGE = `Usage: npm run measure:report -- --name <measurement> [options]

  --name <measurement>     the measurement to report on
  --compare-with <m>       compare with measurement m (default: the one it named)
  --fake                   a measurement of npm run measure:fake`;

/** "D:no-claim" as a request and a rule that is scored on it. */
export function parseTarget(text: string): Target {
  const [request = "", rule = "", ...rest] = text.split(":");
  if (rest.length > 0 || !request || !rule) {
    throw new Error(
      `"${text}" isn't a target: give a request and a rule, such as D:no-claim.`,
    );
  }
  const target = {
    request: findRequest(request.trim()).name,
    rule: findRule(rule.trim()).name,
  };
  if (!findRule(target.rule).requests.includes(target.request)) {
    throw new Error(
      `The rule ${target.rule} isn't scored on request ${target.request}.`,
    );
  }
  return target;
}

export function parseOptions(argv: string[]): BatchOptions & { fake: boolean } {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      name: { type: "string" },
      purpose: { type: "string" },
      runs: { type: "string", default: "5" },
      requests: { type: "string" },
      "conversations-from": { type: "string" },
      "compare-with": { type: "string" },
      target: { type: "string", multiple: true },
      plan: { type: "boolean", default: false },
      fake: { type: "boolean", default: false },
    },
  });
  if (!values.name || !values.purpose) {
    throw new Error(
      `Give the measurement's --name and the batch's --purpose.\n\n${USAGE}`,
    );
  }
  const requests = values.requests
    ? values.requests.split(",").map((name) => findRequest(name.trim()).name)
    : REQUESTS.map((request) => request.name);
  return {
    measurement: values.name,
    purpose: values.purpose,
    runs: Number(values.runs),
    requests: [...new Set<RequestName>(requests)],
    planOnly: values.plan,
    conversationsFrom: values["conversations-from"] ?? values["compare-with"],
    compareWith: values["compare-with"],
    targets: values.target?.map(parseTarget),
    fake: values.fake,
  };
}

export function parseReportOptions(argv: string[]): {
  name: string;
  compareWith: string | undefined;
  fake: boolean;
} {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      name: { type: "string" },
      "compare-with": { type: "string" },
      fake: { type: "boolean", default: false },
    },
  });
  if (!values.name) {
    throw new Error(`Give the measurement's --name.\n\n${REPORT_USAGE}`);
  }
  return {
    name: values.name,
    compareWith: values["compare-with"],
    fake: values.fake,
  };
}

/** This machine's account ID and token, from the one file that may hold them. */
export function readToken(text: string): {
  accountId: string;
  apiToken: string;
} {
  const values = parseEnv(text.replace(/^\uFEFF/, ""));
  const accountId = values.CLOUDFLARE_ACCOUNT_ID ?? "";
  const apiToken = values.CLOUDFLARE_API_TOKEN ?? "";
  if (!/^[0-9a-f]{32}$/.test(accountId) || apiToken === "") {
    // Never the values themselves.
    throw new Error(
      `${PROVIDER_KEY_FILE} needs CLOUDFLARE_ACCOUNT_ID (32 characters, 0 to 9 and a to f) and CLOUDFLARE_API_TOKEN.`,
    );
  }
  return { accountId, apiToken };
}

function environment(fake: boolean, planOnly: boolean): BatchEnvironment {
  const common = {
    notesDir: join(process.cwd(), "notes"),
    repoRoot: process.cwd(),
    print: (line: string) => console.log(line),
  };
  if (fake) {
    return {
      ...common,
      root: join(process.cwd(), FAKE_MEASUREMENTS_DIR),
      chatModel: () =>
        createFakeChatModel({ chunkDelayInMs: 0, failedMessages: new Set() }),
      embedder: () => createFakeEmbedder(),
      search: { kind: "fake", model: createFakeEmbedder().model },
      secrets: {},
      // No neurons to protect, so no pause between requests either.
      meter: { spacingMs: 0 },
    };
  }
  // The guard ran first and checked the token is there (package.json).
  if (process.env.npm_lifecycle_event !== "measure") {
    throw new Error(
      "The measurement on the real model runs only as `npm run measure`, after the environment guard.",
    );
  }
  const unavailable = () => {
    throw new Error("A plan sends nothing.");
  };
  if (planOnly) {
    return {
      ...common,
      root: join(process.cwd(), MEASUREMENTS_DIR),
      chatModel: unavailable,
      embedder: unavailable,
      search: { kind: "real", model: EMBEDDING_MODEL },
      secrets: {},
    };
  }
  const settings = readToken(readFileSync(PROVIDER_KEY_FILE, "utf8"));
  return {
    ...common,
    root: join(process.cwd(), MEASUREMENTS_DIR),
    chatModel: (fetch) => createCloudflareChatModel({ ...settings, fetch }),
    embedder: (fetch) => createCloudflareEmbedder({ ...settings, fetch }),
    search: { kind: "real", model: EMBEDDING_MODEL },
    secrets: { token: settings.apiToken, accountId: settings.accountId },
  };
}

/** `npm run measure:report`: reads the records only, so it needs no token. */
async function report(argv: string[]): Promise<number> {
  const { name, compareWith, fake } = parseReportOptions(argv);
  const root = join(
    process.cwd(),
    fake ? FAKE_MEASUREMENTS_DIR : MEASUREMENTS_DIR,
  );
  const lines = await writeReport(root, name, {
    compareWith,
    git: gitIn(process.cwd()),
  });
  console.log(lines.join("\n"));
  console.log(
    `\nSaved in ${join(fake ? FAKE_MEASUREMENTS_DIR : MEASUREMENTS_DIR, name, "report.md")}.`,
  );
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  try {
    if (argv[0] === "--report") return await report(argv.slice(1));
    const { fake, ...options } = parseOptions(argv);
    const result = await runBatch(options, environment(fake, options.planOnly));
    return result.stopped ? 1 : 0;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}
