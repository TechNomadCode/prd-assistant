import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { format } from "node:util";
import type { CheckedSection } from "../../lib/prd.ts";
import { tally } from "../../lib/prd.ts";
import type { ChatModel } from "../ai/chat-model.ts";
import type { Embedder } from "../ai/embedder.ts";
import { measureAnswer, type MeasuredAnswer } from "./answer.ts";
import {
  appendLedger,
  embeddingSpend,
  expectedNeurons,
  createMeter,
  readLedger,
  totals,
  type LedgerEntry,
  type Meter,
  type Refusal,
  type Spend,
} from "./budget.ts";
import {
  conversationFor,
  qualifies,
  readConversation,
  saveConversation,
  type SavedConversation,
} from "./conversations.ts";
import { acquireLock } from "./lock.ts";
import { copyPlan, copySources, makeCopy } from "./passages.ts";
import { createRecorder } from "./recorder.ts";
import {
  checkRunName,
  RecordRefusedError,
  recordPath,
  writeRecord,
  type RecordSecrets,
} from "./records.ts";
import {
  REQUESTS,
  type MeasuredRequest,
  type RequestName,
} from "./requests.ts";

// One batch of the measurement (docs/plan.md, slice 9b): `npm run measure`
// once. It sends the fixed requests, the requests taking turns run by run,
// fills only the runs that have no record yet, and never repeats an answer by
// itself. Before it starts it says how many answers it sends and what they're
// expected to cost; it stops once the batch passes 1.5 times that; after
// each answer it prints the answer's neurons and the day's and month's totals.
// A *run* is one answer to one request; a *batch* is one command.

/** A batch stops once it has spent this much more than it expected. */
export const CAP_FACTOR = 1.5;

/** After a per-minute refusal, the batch waits this long before the next answer. */
export const PER_MINUTE_PAUSE_MS = 60_000;

/** The live site's limit for one answer (`maxDuration` on the chat route). */
export const LIVE_SITE_SECONDS = 60;

/** A measurement's name, such as "baseline" or "prompt-v4". */
const MEASUREMENT_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DATE_FOLDER = /^\d{4}-\d{2}-\d{2}$/;
const RECORD_FILE = /^([A-Za-z0-9]+)-(\d+)\.json$/;

export type BatchOptions = {
  /** The measurement this batch adds to; its records live under this name. */
  measurement: string;
  /** Why it runs: the baseline, or one change with its expected effect. */
  purpose: string;
  /** Runs per request, numbered from 1. */
  runs: number;
  requests: RequestName[];
  /** Print the plan and spend nothing. */
  planOnly: boolean;
  /** Take the saved conversations of another measurement, such as the baseline. */
  conversationsFrom?: string | undefined;
};

export type BatchEnvironment = {
  /** Where measurements, the ledger and the passages' copy live. */
  root: string;
  notesDir: string;
  /** The repository, for the setup's commit and versions. */
  repoRoot?: string;
  /** The chat model for one answer, its HTTP calls through `fetch`. */
  chatModel(fetch: typeof globalThis.fetch): ChatModel;
  /** The search's embedder, its HTTP calls through `fetch`. */
  embedder(fetch: typeof globalThis.fetch): Embedder;
  /** Which embedder `embedder` returns, without building it. */
  search: { kind: "fake" | "real"; model: string };
  /** What `writeRecord` refuses and hides. */
  secrets: RecordSecrets;
  print(line: string): void;
  lockFile?: string;
  /** Under the meter; tests replay Cloudflare's replies here. */
  fetch?: typeof globalThis.fetch;
  meter?: { spacingMs?: number; sleep?: (ms: number) => Promise<void> };
  sleep?: (ms: number) => Promise<void>;
};

export type Outcome =
  | { kind: "counted" }
  | { kind: "not run"; reason: string }
  | { kind: "not recorded"; reason: string };

export type BatchResult = {
  /** Why it ended before its plan was done, if it did. */
  stopped: string | null;
  answers: { request: string; run: number; outcome: Outcome }[];
  spend: Spend;
};

type PlannedRun = { request: MeasuredRequest; run: number };

function paths(root: string, measurement: string) {
  const folder = join(root, measurement);
  return {
    folder,
    about: join(folder, "measurement.json"),
    notRun: join(folder, "not-run"),
    conversation: (request: string) =>
      join(folder, "conversations", `${request}.json`),
    ledger: join(root, "spend.jsonl"),
    copy: join(root, "passages.json"),
  };
}

/** The runs of a measurement that have a record, as "A-3". */
export function recordedRuns(folder: string): Set<string> {
  const done = new Set<string>();
  if (!existsSync(folder)) return done;
  for (const date of readdirSync(folder)) {
    if (!DATE_FOLDER.test(date)) continue;
    for (const file of readdirSync(join(folder, date))) {
      const match = RECORD_FILE.exec(file);
      if (match) done.add(`${match[1]}-${match[2]}`);
    }
  }
  return done;
}

/** Runs that were tried and couldn't count, as "A-3", with why. */
function earlierNotRun(folder: string): Map<string, string[]> {
  const tried = new Map<string, string[]>();
  if (!existsSync(folder)) return tried;
  for (const date of readdirSync(folder)) {
    for (const file of readdirSync(join(folder, date))) {
      const match = /^([A-Za-z0-9]+)-(\d+)-/.exec(file);
      if (!match) continue;
      const run = `${match[1]}-${match[2]}`;
      tried.set(run, [...(tried.get(run) ?? []), `${date} ${file}`]);
    }
  }
  return tried;
}

/** The runs still missing, round by round, the requests taking turns. */
export function planRuns(
  options: Pick<BatchOptions, "runs" | "requests">,
  done: Set<string>,
): PlannedRun[] {
  const planned: PlannedRun[] = [];
  for (let run = 1; run <= options.runs; run++) {
    for (const request of REQUESTS) {
      if (!options.requests.includes(request.name)) continue;
      if (!done.has(`${request.name}-${run}`)) planned.push({ request, run });
    }
  }
  return planned;
}

function checkOptions(options: BatchOptions) {
  for (const name of [options.measurement, options.conversationsFrom]) {
    if (name !== undefined && !MEASUREMENT_NAME.test(name)) {
      throw new Error(
        `"${name}" isn't a measurement's name: lowercase letters, digits and dashes, such as baseline.`,
      );
    }
  }
  if (options.purpose.trim() === "") {
    throw new Error(
      "Every batch needs its purpose written down first: the baseline, or one change with its expected effect.",
    );
  }
  if (!Number.isInteger(options.runs) || options.runs < 1) {
    throw new Error(`${options.runs} runs: give a whole number from 1.`);
  }
  if (options.requests.length === 0) throw new Error("No request chosen.");
}

/** A measurement keeps one purpose; a batch with another needs a new name. */
async function checkPurpose(file: string, options: BatchOptions) {
  if (!existsSync(file)) return;
  const about = JSON.parse(await readFile(file, "utf8")) as { purpose: string };
  if (about.purpose.trim() !== options.purpose.trim()) {
    throw new Error(
      `The measurement "${options.measurement}" was started for another purpose ("${about.purpose}"). Give this batch's purpose a new measurement name.`,
    );
  }
}

/** Writes the measurement's purpose down before its first answer is sent. */
async function notePurpose(file: string, options: BatchOptions, time: Date) {
  if (existsSync(file)) return;
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify(
      {
        name: options.measurement,
        purpose: options.purpose,
        startedAt: time.toISOString(),
        conversationsFrom: options.conversationsFrom ?? options.measurement,
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
}

/** "1 answer", "4 answers". */
function answers(count: number): string {
  return `${count} ${count === 1 ? "answer" : "answers"}`;
}

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const round = (value: number) => number.format(value);

/** Keeps what the chat logs during one answer for its record, off the terminal. */
async function capturingLogs<T>(
  work: () => Promise<T>,
): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const originals = methods.map((method) => console[method]);
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      logs.push(`${method}: ${format(...args)}`);
    };
  }
  try {
    return { result: await work(), logs };
  } finally {
    methods.forEach((method, index) => {
      console[method] = originals[index] as (typeof console)[typeof method];
    });
  }
}

/**
 * How the answer ended: "not run" when a quota, busy or per-minute refusal
 * was never recovered by a retry, or the cap cut it off. A refusal the AI
 * SDK's retry got past leaves a whole answer, which counts; the record keeps
 * every refusal either way.
 */
function outcomeOf(
  unrecovered: Refusal[],
  stoppedAtCap: boolean,
): Outcome & { refusal?: Refusal["kind"] } {
  const refusal = unrecovered.find((one) => one.kind !== "other");
  if (refusal) {
    const why = {
      quota: "Cloudflare's daily allocation is used up (429, code 3036)",
      busy: "Cloudflare is out of capacity (code 3040)",
      "per-minute": "Cloudflare's per-minute limit (429)",
      other: "",
    }[refusal.kind];
    return { kind: "not run", reason: why, refusal: refusal.kind };
  }
  if (stoppedAtCap) {
    return { kind: "not run", reason: "the batch passed its cap partway" };
  }
  return { kind: "counted" };
}

/** One line about what the answer did, for the terminal. */
function describeAnswer(measured: MeasuredAnswer): string {
  const sections = measured.answer.chunks
    .filter(
      (chunk) =>
        chunk.type === "tool-output-available" &&
        typeof (chunk.output as { section?: unknown } | undefined)?.section ===
          "string",
    )
    .map((chunk) => {
      const section = chunk.output as CheckedSection;
      const { quotes, confirmed } = tally(section);
      return `saved ${section.section}, ${confirmed} of ${quotes} quotes confirmed`;
    });
  const error = measured.answer.chunks.find((chunk) => chunk.type === "error");
  return [
    ...(sections.length > 0 ? sections : ["saved nothing"]),
    ...(error ? [`ended with "${String(error.errorText)}"`] : []),
  ].join("; ");
}

function stamp(time: Date): string {
  return time.toISOString().slice(11, 19).replaceAll(":", "");
}

export async function runBatch(
  options: BatchOptions,
  env: BatchEnvironment,
): Promise<BatchResult> {
  checkOptions(options);
  const { print } = env;
  const at = paths(env.root, options.measurement);
  const from = paths(
    env.root,
    options.conversationsFrom ?? options.measurement,
  );
  await checkPurpose(at.about, options);
  const ledger = await readLedger(at.ledger);
  const start = new Date();

  // The plan, free: nothing is sent before it's printed.
  const planned = planRuns(options, recordedRuns(at.folder));
  const saved = new Map<"A" | "C1", SavedConversation>();
  for (const request of ["A", "C1"] as const) {
    const conversation = await readConversation(from.conversation(request));
    if (conversation) saved.set(request, conversation);
  }
  const copy = await copyPlan({
    notesDir: env.notesDir,
    file: at.copy,
    model: env.search.model,
  });
  const copyNeurons =
    env.search.kind === "real" ? embeddingSpend(copy.tokenBound).neurons : 0;
  const expectedOf = (runs: PlannedRun[]) =>
    runs.reduce(
      (sum, { request }) => sum + expectedNeurons(request, ledger),
      0,
    );
  // The cap covers the answers that can go now; one that waits for its saved
  // conversation raises it only once that conversation exists.
  const waiting = planned.filter(
    ({ request }) =>
      request.continues !== null && !saved.has(request.continues),
  );
  const ready = planned.filter((run) => !waiting.includes(run));
  const expected = expectedOf(ready) + copyNeurons;
  const cap = expected * CAP_FACTOR;
  const sofar = totals(ledger, start);

  print(`Measurement "${options.measurement}": ${options.purpose.trim()}`);
  if (planned.length === 0) {
    print(
      `Nothing to send: every run from 1 to ${options.runs} of ${options.requests.join(", ")} has a record.`,
    );
    return { stopped: null, answers: [], spend: embeddingSpend(0) };
  }
  print(
    `This batch sends up to ${planned.length} answers: ${planned
      .map(({ request, run }) => `${request.name}-${run}`)
      .join(", ")}.`,
  );
  for (const request of REQUESTS) {
    const source = request.continues;
    if (source === null || saved.has(source)) continue;
    if (!planned.some((one) => one.request === request)) continue;
    print(
      `  ${request.name} waits for a run of ${source} ${source === "A" ? "with every quote confirmed" : "in which the model asks about the connection"}${options.conversationsFrom ? ` in "${options.conversationsFrom}"` : ""}; until then it's skipped.`,
    );
  }
  const again = earlierNotRun(at.notRun);
  const repeats = planned.filter(({ request, run }) =>
    again.has(`${request.name}-${run}`),
  );
  if (repeats.length > 0) {
    print(
      `  Sent again, since they couldn't count before: ${repeats.map(({ request, run }) => `${request.name}-${run}`).join(", ")}.`,
    );
  }
  if (copy.toEmbed > 0) {
    print(
      `  The search's copy embeds ${copy.toEmbed} of ${copy.passages} passages first${env.search.kind === "real" ? `, at most ${round(copyNeurons)} neurons` : ""}.`,
    );
  }
  print(
    `Expected: about ${round(expected)} neurons for the ${answers(ready.length)} that can go now. It stops once the batch passes ${round(cap)}.`,
  );
  if (waiting.length > 0) {
    const more = expectedOf(waiting);
    const conversations = new Set(
      waiting.map(({ request }) => request.continues),
    );
    const one = waiting.length === 1;
    print(
      `  Once their ${conversations.size === 1 ? "conversation exists" : "conversations exist"}, the ${waiting.length} waiting ${one ? "answer adds" : "answers add"} about ${round(more)}, and the cap rises with ${one ? "it" : "them"}, to at most ${round((expected + more) * CAP_FACTOR)}.`,
    );
  }
  print(
    `So far today (UTC): ${round(sofar.day)} neurons; this month: ${round(sofar.month)}.`,
  );
  if (options.planOnly) {
    print("Plan only: nothing was sent.");
    return { stopped: null, answers: [], spend: embeddingSpend(0) };
  }

  const lock = acquireLock(env.lockFile);
  try {
    if (lock.tookOver) {
      print(
        `  Took over the lock of an earlier batch that ended without releasing it (process ${lock.tookOver.pid}).`,
      );
    }
    await notePurpose(at.about, options, start);
    return await sendPlanned({
      options,
      env,
      at,
      planned,
      saved,
      ownConversations: options.conversationsFrom === undefined,
      meter: createMeter({ cap, ...env.meter }),
      expectedOf,
    });
  } finally {
    lock.release();
  }
}

async function sendPlanned({
  options,
  env,
  at,
  planned,
  saved,
  ownConversations,
  meter,
  expectedOf,
}: {
  options: BatchOptions;
  env: BatchEnvironment;
  at: ReturnType<typeof paths>;
  planned: PlannedRun[];
  saved: Map<"A" | "C1", SavedConversation>;
  ownConversations: boolean;
  meter: Meter;
  expectedOf(runs: PlannedRun[]): number;
}): Promise<BatchResult> {
  const { print } = env;
  const sleep =
    env.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const answers: BatchResult["answers"] = [];
  const recordLedger = async (entry: Omit<LedgerEntry, "measurement">) => {
    if (env.search.kind !== "real") return;
    await appendLedger(at.ledger, {
      ...entry,
      measurement: options.measurement,
    });
  };
  const finish = async (stopped: string | null): Promise<BatchResult> => {
    const spend = meter.batch();
    const sofar = totals(await readLedger(at.ledger), new Date());
    if (stopped) print(`Stopped: ${stopped}.`);
    print(
      `This batch: ${round(spend.neurons)} neurons in ${answers.length} answers. Today (UTC): ${round(sofar.day)}; this month: ${round(sofar.month)}.`,
    );
    return { stopped, answers, spend };
  };

  // The search's own copy: free when the notes haven't changed.
  meter.startAnswer();
  const embedder = env.embedder(meter.fetch(env.fetch));
  const { copy, embedded } = await makeCopy({
    notesDir: env.notesDir,
    file: at.copy,
    embedder,
  });
  if (embedded > 0) {
    const { spend } = meter.answer();
    await recordLedger({
      time: new Date().toISOString(),
      what: "the passages' copy",
      outcome: "embedded",
      spend,
    });
    print(
      `The search's copy: embedded ${embedded} passages, ${round(spend.neurons)} neurons (an upper bound).`,
    );
  }
  const sources = copySources(copy, embedder);
  const search = {
    kind: env.search.kind,
    passagesFingerprint: copy.fingerprint,
  };

  const skipped: PlannedRun[] = [];
  for (const [index, plannedRun] of planned.entries()) {
    const { request, run } = plannedRun;
    if (meter.passed()) return finish("the batch passed its cap");
    const start = request.continues ? saved.get(request.continues) : null;
    if (request.continues && !start) {
      skipped.push(plannedRun);
      continue;
    }
    checkRunName({ request: request.name, run });

    const messages = await conversationFor(request, start ?? null);
    const recorder = createRecorder();
    meter.startAnswer();
    const model = env.chatModel(recorder.fetch(meter.fetch(env.fetch)));
    const { result: measured, logs } = await capturingLogs(() =>
      measureAnswer({
        request: request.name,
        run,
        messages,
        dependencies: { model, ...sources },
        search,
        recorder,
        root: env.repoRoot,
      }),
    );
    const { spend, refusals, unrecovered, stoppedAtCap } = meter.answer();
    let outcome: Outcome & { refusal?: Refusal["kind"] } = outcomeOf(
      unrecovered,
      stoppedAtCap,
    );
    const time = new Date(measured.answer.startedAt);
    const record = {
      ...measured,
      measurement: { name: options.measurement, purpose: options.purpose },
      startsFrom: start
        ? {
            request: start.from.request,
            run: start.from.run,
            fingerprint: start.fingerprint,
          }
        : null,
      outcome: {
        kind: outcome.kind,
        reason: "reason" in outcome ? outcome.reason : null,
      },
      refusals,
      spend,
      logs,
    };
    const path =
      outcome.kind === "counted"
        ? recordPath(at.folder, { time, request: request.name, run })
        : join(
            at.notRun,
            time.toISOString().slice(0, 10),
            `${request.name}-${run}-${stamp(time)}.json`,
          );
    try {
      await writeRecord(path, record, env.secrets);
    } catch (error) {
      if (!(error instanceof RecordRefusedError)) throw error;
      outcome = { kind: "not recorded", reason: error.message };
    }
    await recordLedger({
      time: measured.answer.startedAt,
      what: `${request.name}-${run}`,
      request: request.name,
      run,
      outcome: outcome.kind,
      spend,
    });
    answers.push({ request: request.name, run, outcome });

    const seconds = measured.answer.durationMs / 1000;
    const sofar = totals(await readLedger(at.ledger), new Date());
    print(
      [
        `${request.name}-${run}: ${outcome.kind}${"reason" in outcome ? ` (${outcome.reason})` : ""}`,
        `${measured.modelCalls.length} model calls`,
        `${round(spend.inputTokens + spend.outputTokens)} tokens`,
        `${round(spend.neurons)} neurons`,
        `${seconds.toFixed(0)} s${seconds > LIVE_SITE_SECONDS ? ` (over the live site's ${LIVE_SITE_SECONDS})` : ""}`,
        describeAnswer(measured),
        `today ${round(sofar.day)}, this month ${round(sofar.month)}`,
      ].join(" · "),
    );

    if (
      ownConversations &&
      outcome.kind === "counted" &&
      (request.name === "A" || request.name === "C1") &&
      !saved.has(request.name)
    ) {
      const reason = qualifies(request.name, measured.answer.chunks);
      if (reason) {
        saved.set(
          request.name,
          await saveConversation({
            file: at.conversation(request.name),
            from: { request: request.name, run, record: path },
            reason,
            messages,
            chunks: measured.answer.chunks,
          }),
        );
        const next = REQUESTS.filter(
          (one) => one.continues === request.name,
        ).map((one) => one.name);
        print(
          `  ${next.join(" and ")} now start${next.length === 1 ? "s" : ""} from ${request.name}-${run}: ${reason}.`,
        );
        // Only the runs still to come: earlier ones were skipped already.
        const opened = planned
          .slice(index + 1)
          .filter((one) => one.request.continues === request.name);
        if (opened.length > 0) {
          const more = expectedOf(opened) * CAP_FACTOR;
          const cap = meter.raiseCap(more);
          print(
            `  The cap rises by ${round(more)} for ${opened.map((one) => `${one.request.name}-${one.run}`).join(", ")}, to ${round(cap)}.`,
          );
        }
      }
    }

    if (outcome.refusal === "quota") {
      return finish("Cloudflare's daily allocation is used up");
    }
    if (outcome.refusal === "per-minute") {
      print(`  Waiting a minute for the per-minute limit.`);
      await sleep(PER_MINUTE_PAUSE_MS);
    }
  }
  if (skipped.length > 0) {
    print(
      `Skipped, still waiting for their saved conversation: ${skipped.map(({ request, run }) => `${request.name}-${run}`).join(", ")}. A later batch sends them.`,
    );
  }
  return finish(null);
}
