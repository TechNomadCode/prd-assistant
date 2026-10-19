import { execFileSync } from "node:child_process";
import { hash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SYSTEM_PROMPT } from "../prompts/system-prompt.ts";
import type { Recorder } from "./recorder.ts";
import { checkRunName } from "./records.ts";

// What shaped a measured answer (src/server/AGENTS.md, *Judging the model's
// behaviour*), saved with it, so two measurements are compared only when they
// differ in the one part that was changed.

export type SearchSetup = {
  /** The fake embedder, or the real one over the measurement's own copy. */
  kind: "fake" | "real";
  /** Of the passages the search ranks, so a change in the notes shows. */
  passagesFingerprint: string;
};

export type RunSetup = {
  request: string;
  run: number;
  /** UTC, when the answer started. */
  time: string;
  model: {
    /** The model's id as our code calls it. */
    called: string;
    /** The names Cloudflare's replies gave, if any. */
    echoed: string[];
  };
  prompt: { version: number; fingerprint: string };
  /** The tools the first model call was offered; null if none. */
  tools: { names: string[]; fingerprint: string } | null;
  /** The generation settings in the first request body, where present. */
  sent: Record<string, unknown>;
  code: {
    commit: string;
    /** `git status --porcelain` lines for the paths that shape the answer. */
    uncommitted: string[];
    /** Of those changes' contents; null when there are none. */
    uncommittedFingerprint: string | null;
  };
  search: SearchSetup;
  versions: { ai: string; openaiCompatible: string; node: string };
};

/** Settings Cloudflare's input schema takes that change how the model writes. */
const SETTINGS_SENT = [
  "max_tokens",
  "temperature",
  "top_p",
  "top_k",
  "seed",
  "repetition_penalty",
  "frequency_penalty",
  "presence_penalty",
  "reasoning_effort",
  "reasoning",
] as const;

/** The chat's code, the scripts that run it, and the libraries. */
const CODE_PATHS = ["src", "scripts", "package.json", "package-lock.json"];

/** The part of the setup known before the answer starts. */
export type SetupBeforeAnswer = Omit<RunSetup, "model" | "tools" | "sent">;

/**
 * Checks the run's names and reads the code's state before the answer starts,
 * so a broken setup fails before any neurons are spent.
 */
export function startSetup({
  request,
  run,
  time,
  search,
  root = process.cwd(),
}: {
  request: string;
  run: number;
  time: Date;
  search: SearchSetup;
  root?: string;
}): SetupBeforeAnswer {
  checkRunName({ request, run });
  if (!search.passagesFingerprint) {
    throw new Error("The setup needs the passages' fingerprint.");
  }
  return {
    request,
    run,
    time: time.toISOString(),
    prompt: {
      version: SYSTEM_PROMPT.version,
      fingerprint: hash("sha256", SYSTEM_PROMPT.text),
    },
    code: codeVersion(root),
    search,
    versions: {
      ai: packageVersion(root, "ai"),
      openaiCompatible: packageVersion(root, "@ai-sdk/openai-compatible"),
      node: process.version,
    },
  };
}

/** The rest of the setup, from the answer's recorded calls. */
export function finishSetup(
  before: SetupBeforeAnswer,
  {
    model,
    recorder,
  }: { model: string; recorder: Pick<Recorder, "http" | "modelCalls"> },
): RunSetup {
  const firstCall = recorder.modelCalls[0];
  const firstBody = recorder.http.find((attempt) =>
    isObject(attempt.requestBody),
  )?.requestBody as Record<string, unknown> | undefined;

  return {
    ...before,
    model: { called: model, echoed: echoedModels(recorder) },
    tools: firstCall?.options.toolsFingerprint
      ? {
          names: firstCall.options.tools,
          fingerprint: firstCall.options.toolsFingerprint,
        }
      : null,
    sent: Object.fromEntries(
      SETTINGS_SENT.filter((name) => firstBody?.[name] !== undefined).map(
        (name) => [name, firstBody?.[name]],
      ),
    ),
  };
}

function echoedModels({
  http,
  modelCalls,
}: Pick<Recorder, "http" | "modelCalls">): string[] {
  const names = new Set<string>();
  for (const attempt of http) {
    const body = attempt.responseBody;
    if (isObject(body) && typeof body.model === "string") names.add(body.model);
  }
  for (const call of modelCalls) {
    for (const part of call.parts) {
      if (part.type === "response-metadata" && typeof part.modelId === "string")
        names.add(part.modelId);
    }
  }
  return [...names];
}

function codeVersion(root: string): RunSetup["code"] {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const uncommitted = git("status", "--porcelain", "--", ...CODE_PATHS)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  let uncommittedFingerprint: string | null = null;
  if (uncommitted.length > 0) {
    // The diff misses new files, so their contents count too.
    const untracked = git(
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      ...CODE_PATHS,
    )
      .split("\n")
      .filter(Boolean)
      .map((path) => `${path}\n${readFileSync(join(root, path), "utf8")}`);
    uncommittedFingerprint = hash(
      "sha256",
      [git("diff", "HEAD", "--", ...CODE_PATHS), ...untracked].join("\n"),
    );
  }
  return {
    commit: git("rev-parse", "HEAD").trim(),
    uncommitted,
    uncommittedFingerprint,
  };
}

function packageVersion(root: string, name: string): string {
  const manifest = JSON.parse(
    readFileSync(join(root, "node_modules", name, "package.json"), "utf8"),
  ) as { version: string };
  return manifest.version;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
