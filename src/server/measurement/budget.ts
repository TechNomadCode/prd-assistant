import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { embeddingTokenBound } from "../ai/embedding-input.ts";

// Careful spending (src/server/AGENTS.md, the budget): every call to
// Cloudflare goes through the meter, which counts the neurons as replies come
// in, spaces the requests well under the per-minute limit, and refuses the
// next request once the batch has passed its cap. The tally of every batch
// lives in a ledger, one line per answer, for the day's and the month's totals.

/**
 * Neurons per million tokens: gpt-oss-120b's input and output, and
 * bge-large-en-v1.5's input (https://developers.cloudflare.com/workers-ai/platform/pricing/,
 * read 2026-10-19; docs/decisions.md, External services).
 */
export const RATES = {
  chatInput: 31_818,
  chatOutput: 68_182,
  embeddingInput: 18_582,
} as const;

/**
 * What an answer is expected to cost before any has been measured: the
 * estimate's typical figures (docs/records/measurement-estimate-2026-10-19.md,
 * appendix E; local), 300 for the first section and 450 for the other new
 * chats, 785 for an answer that continues a saved conversation.
 */
export const FIRST_GUESS = { A: 300, new: 450, continued: 785 } as const;

/** At most one request a second: a fifth of the 300 a minute allowed. */
export const REQUEST_SPACING_MS = 1000;

export type Spend = {
  chatCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** Cloudflare reports no tokens for embeddings: the loader's upper bound. */
  embeddingTokenBound: number;
  neurons: number;
};

export function noSpend(): Spend {
  return {
    chatCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    embeddingTokenBound: 0,
    neurons: 0,
  };
}

function add(total: Spend, more: Spend): void {
  total.chatCalls += more.chatCalls;
  total.inputTokens += more.inputTokens;
  total.outputTokens += more.outputTokens;
  total.embeddingTokenBound += more.embeddingTokenBound;
  total.neurons += more.neurons;
}

export function chatSpend(inputTokens: number, outputTokens: number): Spend {
  return {
    ...noSpend(),
    chatCalls: 1,
    inputTokens,
    outputTokens,
    neurons:
      (inputTokens * RATES.chatInput + outputTokens * RATES.chatOutput) /
      1_000_000,
  };
}

export function embeddingSpend(tokenBound: number): Spend {
  return {
    ...noSpend(),
    embeddingTokenBound: tokenBound,
    neurons: (tokenBound * RATES.embeddingInput) / 1_000_000,
  };
}

/**
 * Why Cloudflare refused a request. Quota (429, `QUOTA_CODES`: the day's free
 * allocation is used up), busy (code 3040: out of capacity) and any other
 * 429 (the per-minute limit) make an answer "not run"
 * (https://developers.cloudflare.com/workers-ai/platform/errors/, read
 * 2026-10-19).
 */
export type Refusal = {
  status: number;
  code: number | null;
  kind: "quota" | "busy" | "per-minute" | "other";
};

/**
 * The day's free allocation used up: 3036 on Cloudflare's errors page, 4006
 * as the `/ai/v1` endpoint actually sent it (2026-10-20), with the same message.
 */
export const QUOTA_CODES: readonly number[] = [3036, 4006];

export function classifyRefusal(status: number, body: unknown): Refusal {
  const code = errorCode(body);
  const kind =
    code !== null && QUOTA_CODES.includes(code)
      ? "quota"
      : code === 3040
        ? "busy"
        : status === 429
          ? "per-minute"
          : "other";
  return { status, code, kind };
}

/** Cloudflare's error code, from its own format or an OpenAI-style one. */
function errorCode(body: unknown): number | null {
  if (typeof body === "string") {
    const match = /\b(3036|3040|4006)\b/.exec(body);
    return match ? Number(match[1]) : null;
  }
  if (typeof body !== "object" || body === null) return null;
  const { errors, error } = body as { errors?: unknown; error?: unknown };
  const candidates = [
    ...(Array.isArray(errors) ? errors : []),
    ...(error ? [error] : []),
  ];
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown } | null)?.code;
    if (typeof code === "number") return code;
    if (typeof code === "string" && /^\d+$/.test(code)) return Number(code);
  }
  return errorCode(JSON.stringify(body));
}

/** The batch passed its cap, so the meter sent nothing more. */
export class BudgetExceededError extends Error {
  constructor(cap: number) {
    super(
      `This batch passed its cap of ${Math.round(cap)} neurons, so nothing more was sent.`,
    );
    this.name = "BudgetExceededError";
  }
}

export type Meter = {
  /** Counts, spaces and, past the cap, refuses every request it sends. */
  fetch(inner?: typeof fetch): typeof fetch;
  /** Starts counting a new answer's spend and refusals. */
  startAnswer(): void;
  /**
   * This answer's spend, every refusal Cloudflare gave it, the refusals no
   * retry recovered from, and whether the cap cut it off.
   */
  answer(): {
    spend: Spend;
    refusals: Refusal[];
    unrecovered: Refusal[];
    stoppedAtCap: boolean;
  };
  batch(): Spend;
  /** The batch has passed its cap. */
  passed(): boolean;
  /** Allows this many more neurons, for answers that became possible. */
  raiseCap(neurons: number): number;
};

export function createMeter({
  cap,
  spacingMs = REQUEST_SPACING_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => performance.now(),
}: {
  /** Neurons; the meter refuses to send once the batch has spent more. */
  cap: number;
  spacingMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Meter {
  const batch = noSpend();
  let answer = noSpend();
  let limit = cap;
  let refusals: Refusal[] = [];
  // The AI SDK retries a refused request as it was, so a refusal is recovered
  // only when the same request, to the same address with the same body,
  // succeeds later; a new search after a failed one doesn't undo it.
  let unrecovered = new Map<string, Refusal>();
  let stoppedAtCap = false;
  let lastSent = Number.NEGATIVE_INFINITY;

  const count = (spend: Spend) => {
    add(batch, spend);
    add(answer, spend);
  };

  return {
    fetch(inner = globalThis.fetch) {
      const metered = async (input: RequestInfo | URL, init?: RequestInit) => {
        if (batch.neurons > limit) {
          stoppedAtCap = true;
          throw new BudgetExceededError(limit);
        }
        const wait = lastSent + spacingMs - now();
        if (wait > 0) await sleep(wait);
        lastSent = now();

        const url = input instanceof Request ? input.url : String(input);
        const request = `${url} ${typeof init?.body === "string" ? init.body : ""}`;
        if (url.endsWith("/embeddings")) {
          count(embeddingSpend(embeddingBound(init?.body)));
        }
        const response = await inner(input, init);
        const body = parsed(await response.clone().text());
        if (response.ok) {
          unrecovered.delete(request);
        } else {
          const refusal = classifyRefusal(response.status, body);
          refusals.push(refusal);
          unrecovered.set(request, refusal);
        }
        const usage = (body as { usage?: Record<string, unknown> } | null)
          ?.usage;
        if (
          typeof usage?.prompt_tokens === "number" ||
          typeof usage?.completion_tokens === "number"
        ) {
          count(
            chatSpend(
              Number(usage.prompt_tokens ?? 0),
              Number(usage.completion_tokens ?? 0),
            ),
          );
        }
        return response;
      };
      return metered as typeof fetch;
    },
    startAnswer() {
      answer = noSpend();
      refusals = [];
      unrecovered = new Map();
      stoppedAtCap = false;
    },
    answer: () => ({
      spend: { ...answer },
      refusals: [...refusals],
      unrecovered: [...unrecovered.values()],
      stoppedAtCap,
    }),
    batch: () => ({ ...batch }),
    passed: () => batch.neurons > limit,
    raiseCap(neurons) {
      limit += neurons;
      return limit;
    },
  };
}

/** The upper bound of an embedding request's tokens, from the texts it sends. */
function embeddingBound(body: RequestInit["body"]): number {
  if (typeof body !== "string") return 0;
  const { input } = (parsed(body) ?? {}) as { input?: unknown };
  const texts = Array.isArray(input) ? input : [input];
  return texts.reduce<number>(
    (sum, text) =>
      typeof text === "string" ? sum + embeddingTokenBound(text) : sum,
    0,
  );
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

// The ledger: one JSON line per answer or passage copy, real batches only.

export type LedgerEntry = {
  /** UTC. */
  time: string;
  measurement: string;
  /** "A-3" for an answer; "the passages' copy" for the search's copy. */
  what: string;
  request?: string;
  run?: number;
  outcome: string;
  spend: Spend;
};

export async function readLedger(file: string): Promise<LedgerEntry[]> {
  if (!existsSync(file)) return [];
  return (await readFile(file, "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as LedgerEntry);
}

export async function appendLedger(
  file: string,
  entry: LedgerEntry,
): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(entry)}\n`);
}

/** The neurons of the UTC day and the UTC calendar month of `time`. */
export function totals(
  entries: LedgerEntry[],
  time: Date,
): { day: number; month: number } {
  const day = time.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  let dayTotal = 0;
  let monthTotal = 0;
  for (const entry of entries) {
    if (entry.time.startsWith(month)) monthTotal += entry.spend.neurons;
    if (entry.time.startsWith(day)) dayTotal += entry.spend.neurons;
  }
  return { day: dayTotal, month: monthTotal };
}

/**
 * What the next answer to a request is expected to cost: the mean of its
 * counted answers so far, or the estimate's figure before there are any.
 */
export function expectedNeurons(
  request: { name: string; continues: string | null },
  entries: LedgerEntry[],
): number {
  const counted = entries.filter(
    (entry) => entry.request === request.name && entry.outcome === "counted",
  );
  if (counted.length > 0) {
    return (
      counted.reduce((sum, entry) => sum + entry.spend.neurons, 0) /
      counted.length
    );
  }
  if (request.name === "A") return FIRST_GUESS.A;
  return request.continues === null ? FIRST_GUESS.new : FIRST_GUESS.continued;
}
