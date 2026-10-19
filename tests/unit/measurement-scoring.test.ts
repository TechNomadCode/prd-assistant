import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NO_QUOTE,
  OPEN_QUESTIONS,
  type CheckedCitation,
  type CheckedStatement,
  type SectionName,
} from "@/lib/prd";
import { createFakeChatModel } from "@/server/ai/fake-chat-model";
import { createFakeEmbedder } from "@/server/ai/fake-embedder";
import { noSpend, type Spend } from "@/server/measurement/budget";
import {
  parseOptions,
  parseReportOptions,
  parseTarget,
} from "@/server/measurement/cli";
import {
  conversationFor,
  visitorMessageId,
} from "@/server/measurement/conversations";
import {
  cellOf,
  dropOf,
  fisherOneSided,
  readMeasurement,
  reportLines,
  setupDifferences,
  writeReport,
  type Measurement,
  type RunRecord,
  type ScoredRun,
} from "@/server/measurement/report";
import { findRequest, type RequestName } from "@/server/measurement/requests";
import {
  runBatch,
  type BatchEnvironment,
  type BatchOptions,
} from "@/server/measurement/runner";
import { scoreAnswer, type RuleName } from "@/server/measurement/score";

// The measurement's scoring, report and comparison (docs/plan.md, slice 9c),
// on answers built by hand in the shape the UI stream records, and on the
// fake model. Nothing leaves the machine.

type Chunk = Record<string, unknown>;

const say = (delta: string): Chunk => ({ type: "text-delta", id: "t", delta });

function save(
  statements: CheckedStatement[],
  section: SectionName = "Introduction / Overview",
  id = "save-1",
): Chunk[] {
  return [
    {
      type: "tool-input-available",
      toolCallId: id,
      toolName: "saveSection",
      input: {},
    },
    {
      type: "tool-output-available",
      toolCallId: id,
      output: { section, statements },
    },
  ];
}

const NAMES: Record<string, string> = {
  maya: "Maya",
  henk: "Henk",
  daan: "Daan",
  sofia: "Sofia",
  ravi: "Ravi",
  lena: "Lena",
};

function interview(
  passage: string,
  { confirmed = true, quote = "the quoted words" } = {},
): CheckedCitation {
  return {
    source: "interview",
    passage,
    interviewee: NAMES[passage.split("-")[0] ?? ""] ?? "Someone",
    question: "The researcher's question",
    answer: "The answer",
    quote,
    confirmed,
  };
}

const chat = (messageId?: string, quote = "your words"): CheckedCitation =>
  messageId
    ? { source: "chat", quote, confirmed: true, messageId }
    : { source: "chat", quote, confirmed: false };

const statement = (
  text: string,
  ...citations: CheckedCitation[]
): CheckedStatement => ({ text, citations });

function verdicts(request: RequestName, chunks: Chunk[]) {
  return Object.fromEntries(
    scoreAnswer(request, chunks).rules.map((rule) => [rule.rule, rule.verdict]),
  ) as Partial<Record<RuleName, string>>;
}

describe("scoring an answer", () => {
  it("passes a first section saved before any question, with every quote confirmed", () => {
    const chunks = [
      ...save([statement("Households share one list.", interview("maya-1"))]),
      say("Does this capture it? Shall we move on to Goals / Objectives?"),
    ];
    expect(verdicts("A", chunks)).toEqual({
      quotes: "pass",
      cites: "pass",
      "saves-first": "pass",
    });
  });

  it("fails a first section that asked first, or saved nothing", () => {
    const asked = [
      say("Who is the product for?"),
      ...save([statement("Households share one list.", interview("maya-1"))]),
    ];
    expect(verdicts("A", asked)["saves-first"]).toBe("fail");

    const nothing = scoreAnswer("A", [say("Here is a draft of the overview.")]);
    expect(nothing.rules).toEqual([
      { rule: "quotes", verdict: "saved nothing", why: null, read: [] },
      { rule: "cites", verdict: "saved nothing", why: null, read: [] },
      {
        rule: "saves-first",
        verdict: "fail",
        why: "it saved nothing",
        read: [],
      },
    ]);
    expect(nothing.reply).toBe("Here is a draft of the overview.");
  });

  it("scores only this answer's saves, never a save that failed", () => {
    const failed = [
      {
        type: "tool-input-available",
        toolCallId: "save-1",
        toolName: "saveSection",
        input: {},
      },
      { type: "tool-output-error", toolCallId: "save-1", errorText: "No." },
    ];
    expect(scoreAnswer("A", failed).saved).toEqual([]);
  });

  it("shows each statement at fault the way the PRD does, without the confirmed quotes", () => {
    const chunks = save([
      statement(
        "Daan wants a weekly plan.",
        interview("daan-2", { confirmed: false, quote: "every week" }),
        interview("maya-1"),
      ),
      statement("It works offline.", {
        source: "unknown",
        passage: "notes-9",
        quote: "offline",
        confirmed: false,
      }),
      statement("Everyone loves it."),
      statement("You asked for it.", chat(undefined, "I want it")),
      statement("Fine.", interview("ravi-1")),
    ]);
    const score = scoreAnswer("A", chunks);
    expect(score.faults).toEqual([
      {
        section: "Introduction / Overview",
        statement: "Daan wants a weekly plan.",
        sources: "Daan, Maya",
        objections: [
          "Unverified quote from Daan: “every week” These words aren't in the answer it cites.",
        ],
      },
      {
        section: "Introduction / Overview",
        statement: "It works offline.",
        sources: "",
        objections: [
          "Unverified quote: “offline” There's no passage “notes-9” in the interviews.",
        ],
      },
      {
        section: "Introduction / Overview",
        statement: "Everyone loves it.",
        sources: "",
        objections: [NO_QUOTE],
      },
      {
        section: "Introduction / Overview",
        statement: "You asked for it.",
        sources: "You, in this chat",
        objections: [
          "Unverified quote from you: “I want it” These words aren't in your messages.",
        ],
      },
    ]);
    expect(verdicts("A", chunks)).toMatchObject({
      quotes: "fail",
      cites: "fail",
    });
  });

  it("lets an open question cite nothing", () => {
    const chunks = save([statement("Who pays for the app?")], OPEN_QUESTIONS);
    expect(verdicts("B", chunks).cites).toBe("pass");
  });

  it("wants both views of the notifications on their own statements, plus an open question", () => {
    const every = statement(
      "Maya wants a notification for every item.",
      interview("maya-3"),
    );
    const never = statement(
      "Sofia would only want to know about claimed items.",
      interview("sofia-6"),
    );
    const open = statement(
      "Open question: notify for every item, or not?",
      interview("henk-4"),
      interview("daan-5"),
    );
    expect(verdicts("B", save([every, never, open]))["both-views"]).toBe(
      "pass",
    );

    // One statement holding both views is a blend, not both views.
    const blended = statement(
      "Some want a notification per item, some don't.",
      interview("maya-3"),
      interview("daan-5"),
    );
    const score = scoreAnswer("B", save([blended, open]));
    expect(
      score.rules.find((rule) => rule.rule === "both-views"),
    ).toMatchObject({ verdict: "pass" });
    expect(
      scoreAnswer("B", save([blended])).rules.find(
        (rule) => rule.rule === "both-views",
      ),
    ).toMatchObject({
      verdict: "fail",
      why: "both views on one statement; no open question",
    });

    // An unverified quote doesn't show a view.
    const unverified = statement(
      "Daan turns them off.",
      interview("daan-5", { confirmed: false }),
    );
    expect(verdicts("B", save([every, unverified, open]))["both-views"]).toBe(
      "pass",
    );
    expect(verdicts("B", save([every, unverified]))["both-views"]).toBe("fail");
  });

  it("passes the gap when the reply asks about the connection, even saving nothing", () => {
    const chunks = [
      say("I drafted nothing yet. Should the list work offline in the shop?"),
    ];
    const score = scoreAnswer("C1", chunks);
    expect(score.rules.find((rule) => rule.rule === "asks")).toEqual({
      rule: "asks",
      verdict: "pass",
      why: null,
      read: ["Asked: Should the list work offline in the shop?"],
    });

    const invented = [
      ...save(
        [
          statement("The list works offline.", interview("ravi-2")),
          statement(
            "It must cope with bad signal.",
            chat("visitor-1", "bad signal"),
          ),
        ],
        "Non-Functional Requirements",
      ),
      say("Does the list need to work offline?"),
    ];
    const asks = scoreAnswer("C1", invented).rules.find(
      (rule) => rule.rule === "asks",
    );
    expect(asks).toMatchObject({
      verdict: "fail",
      why: "1 statements about it cite an interview",
    });
    // A statement resting on the request's words is shown for reading.
    expect(asks?.read).toContain(
      'About the connection: "It must cope with bad signal." (You, in this chat)',
    );
  });

  it("wants the gap's answer cited by its own message", () => {
    expect(visitorMessageId(findRequest("A"))).toBe("visitor-1");
    expect(visitorMessageId(findRequest("C2"))).toBe("visitor-2");
    const cites = (messageId: string) =>
      save(
        [statement("It works offline.", chat(messageId, "items can be added"))],
        "Non-Functional Requirements",
      );
    expect(verdicts("C2", cites("visitor-2"))["cites-answer"]).toBe("pass");
    expect(verdicts("C2", cites("visitor-1"))["cites-answer"]).toBe("fail");
  });

  it("numbers the visitor's message the way the conversation does", async () => {
    const [message] = await conversationFor(findRequest("A"), null);
    expect(message?.id).toBe(visitorMessageId(findRequest("A")));
  });

  it("fails a claim no interview makes when an interview is among its sources", () => {
    const cited = save([
      statement("Users want grocery delivery.", interview("ravi-3")),
    ]);
    const score = scoreAnswer("D", cited);
    expect(score.rules.find((rule) => rule.rule === "no-claim")).toMatchObject({
      verdict: "fail",
    });
    expect(score.faults[0]?.objections).toEqual([
      "An interview is among its sources, but no interview mentions grocery delivery.",
    ]);

    const decided = save([
      statement("Add a dark mode.", chat("visitor-2", "dark mode")),
      statement("Henk wants clear contrast.", interview("henk-3")),
    ]);
    const dark = scoreAnswer("E", decided).rules.find(
      (rule) => rule.rule === "no-claim",
    );
    expect(dark).toMatchObject({ verdict: "pass" });
    expect(dark?.read).toEqual([
      'About dark mode: "Add a dark mode." (You, in this chat)',
      'Cites Henk on colours: "Henk wants clear contrast." (Henk)',
    ]);

    // Saying no without saving is its own outcome, read by hand.
    const refused = scoreAnswer("D", [
      say("No interview mentions grocery delivery."),
    ]);
    expect(refused.rules.map((rule) => rule.verdict)).toEqual([
      "saved nothing",
      "saved nothing",
      "saved nothing",
    ]);
    expect(refused.reply).toBe("No interview mentions grocery delivery.");
  });

  it("keeps the error the visitor would have seen", () => {
    expect(
      scoreAnswer("A", [{ type: "error", errorText: "Something went wrong." }])
        .error,
    ).toBe("Something went wrong.");
  });
});

describe("the comparison's statistics", () => {
  const cell = (pass: number, runs = 5) => ({ pass, runs, savedNothing: 0 });

  it("gives the estimate's one-sided Fisher's exact test at five runs each", () => {
    // docs/records/measurement-estimate-2026-10-19.md, appendix F (local).
    expect(fisherOneSided(cell(0), cell(4))).toBeCloseTo(5 / 210, 6);
    expect(fisherOneSided(cell(1), cell(5))).toBeCloseTo(6 / 252, 6);
    expect(fisherOneSided(cell(1), cell(4))).toBeCloseTo(26 / 252, 6);
    expect(fisherOneSided(cell(3), cell(3))).toBeGreaterThan(0.5);
    expect(fisherOneSided(cell(5), cell(0))).toBeCloseTo(1, 9);
  });

  it("counts a drop in runs, on the change's number of runs", () => {
    expect(dropOf(cell(4), cell(2))).toBe(2);
    expect(dropOf(cell(4), cell(3))).toBe(1);
    expect(dropOf(cell(5, 5), cell(4, 10))).toBe(6);
  });
});

/** A counted run's record, with the setup that shaped it. */
function record({
  request,
  chunks,
  durationMs = 20_000,
  spend = noSpend(),
  prompt = 3,
  commit = "c1",
  conversation = `conversation-${request}`,
}: {
  request: RequestName;
  chunks: Chunk[];
  durationMs?: number;
  spend?: Spend;
  prompt?: number;
  commit?: string;
  conversation?: string;
}): RunRecord {
  return {
    format: 1,
    setup: {
      request,
      run: 1,
      time: "2026-10-20T10:00:00.000Z",
      model: { called: "@cf/openai/gpt-oss-120b", echoed: [] },
      prompt: { version: prompt, fingerprint: `prompt-${prompt}` },
      tools: { names: ["searchNotes", "saveSection"], fingerprint: "tools" },
      sent: { max_tokens: 4096 },
      code: { commit, uncommitted: [], uncommittedFingerprint: null },
      search: { kind: "real", passagesFingerprint: "passages" },
      versions: { ai: "7.0.143", openaiCompatible: "3.0.71", node: "v24" },
    },
    conversation: { messages: 1, fingerprint: conversation },
    answer: { startedAt: "2026-10-20T10:00:00.000Z", durationMs, chunks },
    modelCalls: [],
    http: [],
    outcome: { kind: "counted", reason: null },
    spend,
  };
}

function scored(
  runs: { request: RequestName; record: RunRecord }[],
): ScoredRun[] {
  return runs.map(({ request, record: one }, index) => ({
    request,
    run: index + 1,
    record: one,
    score: scoreAnswer(request, one.answer.chunks),
  }));
}

const passingD = () =>
  record({
    request: "D",
    chunks: save([statement("Delivery is your decision.", chat("visitor-2"))]),
  });
const failingD = () =>
  record({
    request: "D",
    chunks: save([statement("Users want delivery.", interview("ravi-3"))]),
  });
const passingA = () =>
  record({
    request: "A",
    chunks: save([statement("One list.", interview("maya-1"))]),
  });
const failingA = () =>
  record({ request: "A", chunks: [say("Who is it for?")] });

function measurement(
  name: string,
  runs: { request: RequestName; record: RunRecord }[],
  about: Partial<Measurement["about"]> = {},
): Measurement {
  return {
    name,
    about: {
      name,
      purpose: `The purpose of ${name}.`,
      startedAt: "2026-10-20T10:00:00.000Z",
      conversationsFrom: name,
      ...about,
    },
    runs: scored(runs),
    notRun: [],
    notRecorded: [],
  };
}

const noGit = () => "";

describe("the report", () => {
  it("gives k of n per request and rule, with saved nothing apart", () => {
    const report = measurement("baseline", [
      { request: "A", record: passingA() },
      { request: "A", record: failingA() },
    ]);
    expect(cellOf(report.runs, "A", "quotes")).toEqual({
      pass: 1,
      savedNothing: 1,
      runs: 2,
    });
    const lines = reportLines(report);
    expect(lines).toContain(
      "| Every quote passes the check | 1 of 2, 1 saved nothing | – | – | – | – | – |",
    );
    expect(lines).toContain(
      "| Saves a section before asking anything | 1 of 2 |  |  |  |  |  |",
    );
  });

  it("gives the spend with not run apart, the times over 60 seconds and the prompt's version", () => {
    const spend = {
      ...noSpend(),
      inputTokens: 7000,
      outputTokens: 900,
      neurons: 284,
    };
    const report = measurement("baseline", [
      { request: "A", record: record({ request: "A", chunks: [], spend }) },
      {
        request: "A",
        record: record({ request: "A", chunks: [], durationMs: 72_400, spend }),
      },
    ]);
    report.notRun = [
      {
        ...record({ request: "D", chunks: [] }),
        spend: { ...noSpend(), neurons: 40 },
      },
    ];
    report.notRecorded = [{ ...noSpend(), neurons: 10 }];
    const lines = reportLines(report);
    expect(lines).toContain(
      "- Counted: 2 answers, 14,000 input and 1,800 output tokens, 568 neurons. 0 model calls.",
    );
    expect(lines).toContain(
      "- Not run: 1 answer, 0 input and 0 output tokens, 40 neurons.",
    );
    expect(lines).toContain(
      "- Not recorded: 1 answer, 0 input and 0 output tokens, 10 neurons.",
    );
    expect(lines).toContain("- A: 20 s, 72 s");
    expect(lines).toContain(
      "1 of 2 took longer than the live site's 60 seconds: A-2.",
    );
    expect(lines).toContain("- prompt: version 3 (prompt-3)");
  });

  it("tests the targeted rule, flags another that dropped by two runs, and warns about two changed parts", () => {
    const base = measurement("baseline", [
      ...Array.from({ length: 5 }, () => ({
        request: "D" as const,
        record: failingD(),
      })),
      ...Array.from({ length: 5 }, () => ({
        request: "A" as const,
        record: passingA(),
      })),
    ]);
    const changed = (extra: Partial<Parameters<typeof record>[0]>) => [
      ...Array.from({ length: 4 }, () => ({
        request: "D" as const,
        record: {
          ...passingD(),
          setup: record({ request: "D", chunks: [], ...extra }).setup,
        },
      })),
      {
        request: "D" as const,
        record: {
          ...failingD(),
          setup: record({ request: "D", chunks: [], ...extra }).setup,
        },
      },
      ...Array.from({ length: 3 }, () => ({
        request: "A" as const,
        record: {
          ...failingA(),
          setup: record({ request: "A", chunks: [], ...extra }).setup,
        },
      })),
      ...Array.from({ length: 2 }, () => ({
        request: "A" as const,
        record: {
          ...passingA(),
          setup: record({ request: "A", chunks: [], ...extra }).setup,
        },
      })),
    ];
    const change = measurement("prompt-v4", changed({ prompt: 4 }), {
      compareWith: "baseline",
      targets: [{ request: "D", rule: "no-claim" }],
    });
    const lines = reportLines(change, { base, git: noGit });
    expect(lines).toContain(
      "- Targeted, D, No delivery or dark mode statement cites an interview: 0 of 5 → 4 of 5, p = 0.024: better beyond chance at 5%.",
    );
    expect(lines).toContain(
      "- Dropped, A, Every quote passes the check: 5 of 5 → 2 of 5. Read its runs.",
    );
    expect(lines).toContain(
      "- prompt: version 3 (prompt-3) → version 4 (prompt-4)",
    );
    expect(lines.some((line) => line.startsWith("Warning:"))).toBe(false);

    // A second part that differs: code that shapes the answer.
    const twoParts = measurement(
      "prompt-v4",
      changed({ prompt: 4, commit: "c2" }),
      {
        compareWith: "baseline",
        targets: [{ request: "D", rule: "no-claim" }],
      },
    );
    const git = vi.fn(
      () => "src/server/chat.ts\nsrc/server/measurement/report.ts\n",
    );
    const warned = reportLines(twoParts, { base, git });
    expect(git).toHaveBeenCalledWith(
      expect.arrayContaining(["diff", "--name-only", "c1", "c2"]),
    );
    expect(warned).toContain("- code: src/server/chat.ts");
    expect(warned).toContain(
      "Warning: 2 parts of the setup differ (prompt, code), so a difference can't be put down to one change.",
    );
  });

  it("doesn't count a commit that changed only the measurement tool or the prompt", () => {
    const base = scored([{ request: "A", record: passingA() }]);
    const change = scored([
      {
        request: "A",
        record: record({ request: "A", chunks: [], commit: "c2" }),
      },
    ]);
    const git = () =>
      "src/server/measurement/score.ts\nsrc/server/prompts/system-prompt.ts\nsrc/features/prd/prd-document.tsx\n";
    expect(setupDifferences(base, change, git)).toEqual([]);
  });

  it("names saved conversations that differ for a request both measured", () => {
    const base = scored([{ request: "D", record: passingD() }]);
    const change = scored([
      {
        request: "D",
        record: record({ request: "D", chunks: [], conversation: "other" }),
      },
    ]);
    expect(setupDifferences(base, change, noGit)).toEqual([
      { part: "saved conversations", detail: "for D" },
    ]);
  });
});

describe("a comparison's batch and its report", () => {
  let folder: string;

  beforeEach(async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    folder = await mkdtemp(join(tmpdir(), "measurement-report-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(folder, { recursive: true, force: true });
  });

  const lines: string[] = [];
  const env = (): BatchEnvironment => ({
    root: folder,
    notesDir: join(process.cwd(), "notes"),
    chatModel: () =>
      createFakeChatModel({ chunkDelayInMs: 0, failedMessages: new Set() }),
    embedder: () => createFakeEmbedder(),
    search: { kind: "fake", model: createFakeEmbedder().model },
    secrets: {},
    print: (line) => lines.push(line),
    lockFile: join(folder, "lock"),
    meter: { spacingMs: 0 },
  });
  const options = (overrides: Partial<BatchOptions> = {}): BatchOptions => ({
    measurement: "baseline",
    purpose: "The current setup's baseline.",
    runs: 1,
    requests: ["A", "D"],
    planOnly: false,
    ...overrides,
  });

  it("writes the comparison down before it runs, starts from the baseline's conversations and reports on both", async () => {
    await runBatch(options(), env());
    const change = options({
      measurement: "prompt-v4",
      purpose: "Prompt version 4: D stops citing interviews.",
      compareWith: "baseline",
      conversationsFrom: "baseline",
      targets: [{ request: "D", rule: "no-claim" }],
    });
    await runBatch(change, env());

    const about = JSON.parse(
      await readFile(join(folder, "prompt-v4", "measurement.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(about).toMatchObject({
      compareWith: "baseline",
      conversationsFrom: "baseline",
      targets: [{ request: "D", rule: "no-claim" }],
    });
    // The baseline's conversation, not one of its own.
    expect(existsSync(join(folder, "prompt-v4", "conversations"))).toBe(false);

    await expect(
      runBatch(
        { ...change, targets: [{ request: "E", rule: "no-claim" }] },
        env(),
      ),
    ).rejects.toThrow(/another comparison or target/);

    const report = await writeReport(folder, "prompt-v4", { git: noGit });
    expect(report).toContain('## Compared with "baseline"');
    expect(report).toContain(
      "Expected effect, written down before it ran: Prompt version 4: D stops citing interviews.",
    );
    expect(
      await readFile(join(folder, "prompt-v4", "report.md"), "utf8"),
    ).toContain("| Saves a section before asking anything | 1 of 1 |");
    const read = await readMeasurement(folder, "baseline");
    expect(read.runs.map((run) => `${run.request}-${run.run}`)).toEqual([
      "A-1",
      "D-1",
    ]);
  });

  it("saves its own conversations when it names itself, as a flow change does", async () => {
    await runBatch(
      options({
        measurement: "flow",
        conversationsFrom: "flow",
        requests: ["A"],
      }),
      env(),
    );
    expect(existsSync(join(folder, "flow", "conversations", "A.json"))).toBe(
      true,
    );
  });

  it("refuses a comparison without its target, a target on the wrong request, or itself", async () => {
    await expect(
      runBatch(options({ compareWith: "other" }), env()),
    ).rejects.toThrow(/--target/);
    await expect(
      runBatch(
        options({ targets: [{ request: "D", rule: "no-claim" }] }),
        env(),
      ),
    ).rejects.toThrow(/--compare-with/);
    await expect(
      runBatch(
        options({
          compareWith: "other",
          targets: [{ request: "A", rule: "no-claim" }],
        }),
        env(),
      ),
    ).rejects.toThrow(/isn't scored on request A/);
    await expect(
      runBatch(
        options({
          compareWith: "baseline",
          targets: [{ request: "D", rule: "no-claim" }],
        }),
        env(),
      ),
    ).rejects.toThrow(/compared with itself/);
  });
});

describe("the command's comparison options", () => {
  it("reads the comparison, its targets and the report's options", () => {
    expect(
      parseOptions([
        "--name",
        "prompt-v4",
        "--purpose",
        "Prompt version 4.",
        "--compare-with",
        "baseline",
        "--target",
        "D:no-claim",
        "--target",
        "E:no-claim",
      ]),
    ).toMatchObject({
      compareWith: "baseline",
      conversationsFrom: "baseline",
      targets: [
        { request: "D", rule: "no-claim" },
        { request: "E", rule: "no-claim" },
      ],
    });
    expect(() => parseTarget("D")).toThrow(/such as D:no-claim/);
    expect(() => parseTarget("A:no-claim")).toThrow(/isn't scored/);
    expect(() => parseTarget("D:nope")).toThrow(/isn't one of the rules/);
    expect(parseReportOptions(["--name", "baseline", "--fake"])).toEqual({
      name: "baseline",
      compareWith: undefined,
      fake: true,
    });
    expect(() => parseReportOptions([])).toThrow(/--name/);
  });
});
