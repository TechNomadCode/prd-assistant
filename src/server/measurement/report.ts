import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MeasuredAnswer } from "./answer.ts";
import { noSpend, readLedger, type Spend } from "./budget.ts";
import { findRequest, REQUESTS, type RequestName } from "./requests.ts";
import {
  DATE_FOLDER,
  LIVE_SITE_SECONDS,
  RECORD_FILE,
  type MeasurementAbout,
  type Target,
} from "./runner.ts";
import {
  RULES,
  scoreAnswer,
  type AnswerScore,
  type RuleName,
} from "./score.ts";

// The measurement's report (docs/plan.md, slice 9c): how many runs pass each
// rule, per request; the spend, with "not run" apart; each answer's time; the
// prompt's version; the statements at fault the way the PRD shows them; and
// what to read by hand. Compared with another measurement, such as the
// baseline, it tests the rule the change targeted (one-sided Fisher's exact
// test at 5%), flags any other rule that drops by two runs or more, and warns
// when more than one part of the setup differs.

/** A comparison's targeted rule counts as changed beyond chance below this. */
export const SIGNIFICANCE = 0.05;

/** Another rule is flagged when it drops by this many runs or more. */
export const FLAGGED_DROP = 2;

/** A record as the runner writes it. */
export type RunRecord = MeasuredAnswer & {
  outcome: { kind: string; reason: string | null };
  spend: Spend;
};

export type ScoredRun = {
  request: RequestName;
  run: number;
  record: RunRecord;
  score: AnswerScore;
};

export type Measurement = {
  name: string;
  about: MeasurementAbout | null;
  runs: ScoredRun[];
  notRun: RunRecord[];
  /** Answers whose record was refused: only their spend is known, from the ledger. */
  notRecorded: Spend[];
};

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

function subfolders(folder: string, pattern: RegExp): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => pattern.test(name))
    .sort();
}

/** Every record of a measurement, each counted run scored. */
export async function readMeasurement(
  root: string,
  name: string,
): Promise<Measurement> {
  const folder = join(root, name);
  if (!existsSync(folder)) {
    throw new Error(`There's no measurement "${name}" in ${root}.`);
  }
  const aboutFile = join(folder, "measurement.json");
  const about = existsSync(aboutFile)
    ? await readJson<MeasurementAbout>(aboutFile)
    : null;

  const runs: ScoredRun[] = [];
  for (const date of subfolders(folder, DATE_FOLDER)) {
    for (const file of readdirSync(join(folder, date)).sort()) {
      const match = RECORD_FILE.exec(file);
      if (!match) continue;
      const request = findRequest(match[1] ?? "").name;
      const record = await readJson<RunRecord>(join(folder, date, file));
      runs.push({
        request,
        run: Number(match[2]),
        record,
        score: scoreAnswer(request, record.answer.chunks),
      });
    }
  }
  runs.sort(
    (a, b) =>
      REQUESTS.findIndex((one) => one.name === a.request) -
        REQUESTS.findIndex((one) => one.name === b.request) || a.run - b.run,
  );

  const notRun: RunRecord[] = [];
  const notRunFolder = join(folder, "not-run");
  for (const date of subfolders(notRunFolder, DATE_FOLDER)) {
    for (const file of readdirSync(join(notRunFolder, date)).sort()) {
      if (file.endsWith(".json")) {
        notRun.push(await readJson<RunRecord>(join(notRunFolder, date, file)));
      }
    }
  }

  const notRecorded = (await readLedger(join(root, "spend.jsonl")))
    .filter(
      (entry) => entry.measurement === name && entry.outcome === "not recorded",
    )
    .map((entry) => entry.spend);

  return { name, about, runs, notRun, notRecorded };
}

/** How one rule went on one request's runs. */
export type Cell = { pass: number; savedNothing: number; runs: number };

export function cellOf(
  runs: ScoredRun[],
  request: RequestName,
  rule: RuleName,
): Cell {
  const scores = runs
    .filter((run) => run.request === request)
    .flatMap((run) => run.score.rules.filter((one) => one.rule === rule));
  return {
    pass: scores.filter((one) => one.verdict === "pass").length,
    savedNothing: scores.filter((one) => one.verdict === "saved nothing")
      .length,
    runs: scores.length,
  };
}

/** The request and rule pairs that are scored, in the report's order. */
function cells(): Target[] {
  return RULES.flatMap((rule) =>
    REQUESTS.filter((request) => rule.requests.includes(request.name)).map(
      (request) => ({ request: request.name, rule: rule.name }),
    ),
  );
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) {
    result = (result * (n - i + 1)) / i;
  }
  return result;
}

/**
 * One-sided Fisher's exact test: the chance of the change passing at least
 * as often as it did if both sides came from the same pass rate. Under that
 * assumption the change's passes follow the hypergeometric distribution.
 */
export function fisherOneSided(base: Cell, change: Cell): number {
  const total = base.runs + change.runs;
  const passes = base.pass + change.pass;
  const all = binomial(total, change.runs);
  let p = 0;
  for (let k = change.pass; k <= Math.min(passes, change.runs); k++) {
    p +=
      (binomial(passes, k) * binomial(total - passes, change.runs - k)) / all;
  }
  return Math.min(1, p);
}

/** How many runs a rule dropped by, on the change's number of runs. */
export function dropOf(base: Cell, change: Cell): number {
  return (base.pass / base.runs) * change.runs - change.pass;
}

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const round = (value: number) => number.format(value);

function cellText(cell: Cell): string {
  if (cell.runs === 0) return "–";
  return `${cell.pass} of ${cell.runs}${cell.savedNothing > 0 ? `, ${cell.savedNothing} saved nothing` : ""}`;
}

function sumSpend(spends: Spend[]): Spend {
  const total = noSpend();
  for (const spend of spends) {
    total.chatCalls += spend.chatCalls;
    total.inputTokens += spend.inputTokens;
    total.outputTokens += spend.outputTokens;
    total.embeddingTokenBound += spend.embeddingTokenBound;
    total.neurons += spend.neurons;
  }
  return total;
}

function spendText(what: string, count: number, spend: Spend): string {
  return `${what}: ${count} ${count === 1 ? "answer" : "answers"}, ${round(spend.inputTokens)} input and ${round(spend.outputTokens)} output tokens, ${round(spend.neurons)} neurons.`;
}

/** The parts of the setup that shape the answer, each as text to compare. */
export type SetupPart =
  | "model"
  | "prompt"
  | "tools"
  | "generation settings"
  | "code"
  | "search"
  | "libraries"
  | "saved conversations";

function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : inner,
  );
}

/** Each part's values across a measurement's runs. */
export function setupValues(runs: ScoredRun[]): Map<SetupPart, Set<string>> {
  const values = new Map<SetupPart, Set<string>>();
  const add = (part: SetupPart, value: string) => {
    values.set(part, (values.get(part) ?? new Set()).add(value));
  };
  for (const { request, record } of runs) {
    const { setup } = record;
    add(
      "model",
      `${setup.model.called}${setup.model.echoed.length > 0 ? ` (answered as ${[...setup.model.echoed].sort().join(", ")})` : ""}`,
    );
    add(
      "prompt",
      `version ${setup.prompt.version} (${setup.prompt.fingerprint.slice(0, 12)})`,
    );
    add("tools", setup.tools ? setup.tools.fingerprint.slice(0, 12) : "none");
    add("generation settings", sortedJson(setup.sent));
    add("code", codeValue(setup.code));
    add(
      "search",
      `${setup.search.kind} (passages ${setup.search.passagesFingerprint.slice(0, 12)})${setup.search.reranker ? `, reranked by ${setup.search.reranker.model} at ${setup.search.reranker.threshold}` : ""}`,
    );
    add(
      "libraries",
      `ai ${setup.versions.ai}, @ai-sdk/openai-compatible ${setup.versions.openaiCompatible}, Node ${setup.versions.node}`,
    );
    add(
      "saved conversations",
      `${request}: ${record.conversation.fingerprint.slice(0, 12)}`,
    );
  }
  return values;
}

/** The files whose change can change an answer, apart from the prompt, its own part. */
const CODE_THAT_SHAPES = ["src/server", "src/lib", "package-lock.json"];
const NOT_CODE = [
  "src/server/measurement/",
  "src/server/prompts/system-prompt.ts",
];

function codeValue(code: RunRecord["setup"]["code"]): string {
  const shaping = code.uncommitted.filter((line) =>
    shapes(line.slice(3).trim()),
  );
  return shaping.length > 0
    ? `${code.commit} with uncommitted changes (${code.uncommittedFingerprint?.slice(0, 12) ?? "unknown"})`
    : code.commit;
}

function shapes(path: string): boolean {
  return (
    CODE_THAT_SHAPES.some((prefix) => path.startsWith(prefix)) &&
    !NOT_CODE.some((prefix) => path.startsWith(prefix))
  );
}

/** Runs git in the repository; tests replace it. */
export type Git = (args: string[]) => string;

export function gitIn(root: string): Git {
  return (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

/** Which parts differ between two measurements, and how. */
export function setupDifferences(
  base: ScoredRun[],
  change: ScoredRun[],
  git: Git,
): { part: SetupPart; detail: string }[] {
  const before = setupValues(base);
  const after = setupValues(change);
  const differences: { part: SetupPart; detail: string }[] = [];
  for (const part of after.keys()) {
    const from = before.get(part) ?? new Set<string>();
    const to = after.get(part) ?? new Set<string>();
    if (part === "saved conversations") {
      // Only the requests both measured, each with its own conversation.
      const requests = new Set(change.map((run) => run.request));
      const changed = [...requests].filter((request) => {
        const of = (values: Set<string>) =>
          [...values].filter((value) => value.startsWith(`${request}: `));
        const a = of(from);
        const b = of(to);
        return a.length > 0 && a.sort().join() !== b.sort().join();
      });
      if (changed.length > 0) {
        differences.push({ part, detail: `for ${changed.join(", ")}` });
      }
      continue;
    }
    if ([...from].sort().join("\n") === [...to].sort().join("\n")) continue;
    if (part === "code") {
      const detail = codeDifference(from, to, git);
      if (detail) differences.push({ part, detail });
      continue;
    }
    differences.push({
      part,
      detail: `${[...from].join(" / ")} → ${[...to].join(" / ")}`,
    });
  }
  return differences;
}

/** Null when the commits differ only outside the code that shapes the answer. */
function codeDifference(
  from: Set<string>,
  to: Set<string>,
  git: Git,
): string | null {
  const uncommitted = [...from, ...to].filter((value) =>
    value.includes(" with uncommitted changes"),
  );
  if (uncommitted.length > 0) return "uncommitted changes in one of them";
  const files = new Set<string>();
  for (const a of from) {
    for (const b of to) {
      if (a === b) continue;
      try {
        git(["diff", "--name-only", a, b, "--", ...CODE_THAT_SHAPES])
          .split("\n")
          .map((line) => line.trim())
          .filter((path) => path !== "" && shapes(path))
          .forEach((path) => files.add(path));
      } catch (error) {
        return `couldn't compare ${a.slice(0, 7)} with ${b.slice(0, 7)}: ${(error as Error).message.split("\n")[0]}`;
      }
    }
  }
  return files.size > 0 ? [...files].sort().join(", ") : null;
}

/** The report, as Markdown lines. */
export function reportLines(
  measurement: Measurement,
  comparison?: { base: Measurement; git: Git },
): string[] {
  const { runs } = measurement;
  const lines: string[] = [`# Measurement "${measurement.name}"`, ""];
  if (measurement.about) {
    lines.push(`Purpose: ${measurement.about.purpose}`, "");
  }
  const notRecorded = measurement.notRecorded.length;
  lines.push(
    `${runs.length} counted ${runs.length === 1 ? "answer" : "answers"}; ${measurement.notRun.length} not run; ${notRecorded} not recorded.`,
    "",
  );

  // The rules.
  const requests = REQUESTS.map((request) => request.name);
  lines.push(
    "## How many runs pass",
    "",
    `| Rule | ${requests.join(" | ")} |`,
    `| --- |${requests.map(() => " --- |").join("")}`,
  );
  for (const rule of RULES) {
    const row = requests.map((request) =>
      rule.requests.includes(request)
        ? cellText(cellOf(runs, request, rule.name))
        : "",
    );
    lines.push(
      `| ${rule.label}${rule.byHand ? " (read by hand)" : ""} | ${row.join(" | ")} |`,
    );
  }
  lines.push(
    "",
    '"Saved nothing" is its own outcome, never a pass: the reply saved no section, so its words are read by hand below.',
    "",
  );

  // The setup.
  lines.push("## Setup", "");
  for (const [part, values] of setupValues(runs)) {
    if (part === "saved conversations") continue;
    const list = [...values];
    lines.push(
      `- ${part}: ${list.join(" / ")}${list.length > 1 ? " (differs between runs)" : ""}`,
    );
  }
  lines.push("");

  // The spend.
  const counted = sumSpend(runs.map((run) => run.record.spend));
  const notRun = sumSpend(measurement.notRun.map((record) => record.spend));
  const refused = sumSpend(measurement.notRecorded);
  const calls = runs.reduce(
    (sum, run) => sum + run.record.modelCalls.length,
    0,
  );
  lines.push(
    "## Spend",
    "",
    `- ${spendText("Counted", runs.length, counted)} ${calls} model calls.`,
    `- ${spendText("Not run", measurement.notRun.length, notRun)}`,
    ...(notRecorded > 0
      ? [`- ${spendText("Not recorded", notRecorded, refused)}`]
      : []),
    `- In all: ${round(counted.neurons + notRun.neurons + refused.neurons)} neurons. The search's copy of the passages is in the ledger, apart from any measurement.`,
    "",
  );

  // The time.
  const slow = runs.filter(
    (run) => run.record.answer.durationMs > LIVE_SITE_SECONDS * 1000,
  );
  lines.push("## Time", "");
  for (const request of requests) {
    const of = runs.filter((run) => run.request === request);
    if (of.length === 0) continue;
    lines.push(
      `- ${request}: ${of.map((run) => `${Math.round(run.record.answer.durationMs / 1000)} s`).join(", ")}`,
    );
  }
  lines.push(
    "",
    `${slow.length} of ${runs.length} took longer than the live site's ${LIVE_SITE_SECONDS} seconds${slow.length > 0 ? `: ${slow.map((run) => `${run.request}-${run.run}`).join(", ")}` : ""}.`,
    "",
  );

  // The statements at fault, the way the PRD shows them.
  lines.push("## Statements at fault", "");
  const faulty = runs.filter((run) => run.score.faults.length > 0);
  if (faulty.length === 0) lines.push("None.", "");
  for (const run of faulty) {
    lines.push(`### ${run.request}-${run.run}`, "");
    for (const fault of run.score.faults) {
      lines.push(
        `- ${fault.section}: "${fault.statement}"${fault.sources ? ` (${fault.sources})` : ""}`,
        ...fault.objections.map((objection) => `  - ${objection}`),
      );
    }
    lines.push("");
  }

  // What to read by hand.
  lines.push("## Read by hand", "");
  for (const run of runs) {
    const toRead = run.score.rules.filter((score) => {
      const rule = RULES.find((one) => one.name === score.rule);
      return rule?.byHand || score.verdict === "saved nothing";
    });
    if (toRead.length === 0 && !run.score.error) continue;
    lines.push(`### ${run.request}-${run.run}`, "");
    if (run.score.error) lines.push(`- Ended with: ${run.score.error}`);
    lines.push(
      run.score.reply
        ? `- The reply: ${run.score.reply.replaceAll("\n", " ")}`
        : "- The reply has no words.",
    );
    for (const score of toRead) {
      const rule = RULES.find((one) => one.name === score.rule);
      lines.push(
        `- ${rule?.label}: ${score.verdict}${score.why ? ` (${score.why})` : ""}${rule?.byHand ? `. Read ${rule.byHand}.` : ""}`,
        ...score.read.map((line) => `  - ${line}`),
      );
    }
    lines.push("");
  }

  if (comparison) lines.push(...comparisonLines(measurement, comparison));
  return lines;
}

function comparisonLines(
  change: Measurement,
  { base, git }: { base: Measurement; git: Git },
): string[] {
  const lines = [`## Compared with "${base.name}"`, ""];
  const recorded =
    change.about?.compareWith === base.name ? (change.about.targets ?? []) : [];
  if (recorded.length === 0) {
    lines.push(
      `No targeted rule was written down before this measurement ran for a comparison with "${base.name}", so nothing is tested.`,
      "",
    );
  } else {
    lines.push(
      `Expected effect, written down before it ran: ${change.about?.purpose}`,
      "",
    );
  }
  const key = ({ request, rule }: Target) => `${request}:${rule}`;
  const targeted = new Set(recorded.map(key));
  for (const target of recorded) {
    const before = cellOf(base.runs, target.request, target.rule);
    const after = cellOf(change.runs, target.request, target.rule);
    const label = RULES.find((rule) => rule.name === target.rule)?.label;
    if (before.runs === 0 || after.runs === 0) {
      lines.push(
        `- Targeted, ${target.request}, ${label}: not measured on both.`,
      );
      continue;
    }
    const p = fisherOneSided(before, after);
    lines.push(
      `- Targeted, ${target.request}, ${label}: ${before.pass} of ${before.runs} → ${after.pass} of ${after.runs}, p = ${p.toFixed(3)}: ${p < SIGNIFICANCE ? "better beyond chance at 5%" : "not beyond chance at 5%"}.`,
    );
  }
  const drops = cells()
    .filter((cell) => !targeted.has(key(cell)))
    .flatMap((cell) => {
      const before = cellOf(base.runs, cell.request, cell.rule);
      const after = cellOf(change.runs, cell.request, cell.rule);
      if (before.runs === 0 || after.runs === 0) return [];
      // A little room for fractions when the numbers of runs differ.
      if (dropOf(before, after) < FLAGGED_DROP - 1e-9) return [];
      const label = RULES.find((rule) => rule.name === cell.rule)?.label;
      return [
        `- Dropped, ${cell.request}, ${label}: ${before.pass} of ${before.runs} → ${after.pass} of ${after.runs}. Read its runs.`,
      ];
    });
  lines.push(
    ...(drops.length > 0
      ? drops
      : ["- No other rule dropped by two runs or more."]),
  );

  const differences = setupDifferences(base.runs, change.runs, git);
  lines.push("", "Setup differences:", "");
  if (differences.length === 0) lines.push("- None.");
  for (const { part, detail } of differences) {
    lines.push(`- ${part}: ${detail}`);
  }
  if (differences.length > 1) {
    lines.push(
      "",
      `Warning: ${differences.length} parts of the setup differ (${differences.map(({ part }) => part).join(", ")}), so a difference can't be put down to one change.`,
    );
  }
  lines.push("");
  return lines;
}

/** Writes the report into the measurement's folder and returns its lines. */
export async function writeReport(
  root: string,
  name: string,
  { compareWith, git }: { compareWith?: string | undefined; git: Git },
): Promise<string[]> {
  const measurement = await readMeasurement(root, name);
  const base = compareWith ?? measurement.about?.compareWith;
  const lines = reportLines(
    measurement,
    base ? { base: await readMeasurement(root, base), git } : undefined,
  );
  await writeFile(join(root, name, "report.md"), `${lines.join("\n")}\n`);
  return lines;
}
