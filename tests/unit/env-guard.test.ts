import { describe, expect, it } from "vitest";
import {
  checkEnvironment,
  isLocalAddress,
  PROVIDER_KEY_FILE,
} from "@/lib/env-guard";

const local = {
  SUPABASE_URL: "http://127.0.0.1:57321",
  SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  AI_PROVIDER: "fake",
};

/** This machine's own Workers AI settings, as the owner's exception allows. */
const token = {
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_API_TOKEN: "not-a-real-token",
};

function check(values: Record<string, string | undefined>) {
  return checkEnvironment([{ name: ".env.local", values }]);
}

describe("the environment guard", () => {
  it("lets the local stack and the fake adapters through", () => {
    expect(check(local)).toEqual([]);
    expect(check({ ...local, AI_CHAT_PROVIDER: "fake" })).toEqual([]);
    expect(check({})).toEqual([]);
  });

  it("refuses a hosted database address", () => {
    const problems = check({
      ...local,
      SUPABASE_DB_URL:
        "postgresql://postgres.abcd:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
    });

    expect(problems).toEqual([
      expect.objectContaining({
        variable: "SUPABASE_DB_URL",
        source: ".env.local",
      }),
    ]);
  });

  it("refuses a hosted API address", () => {
    const problems = check({
      ...local,
      SUPABASE_URL: "https://abcd.supabase.co",
    });
    expect(problems.map((problem) => problem.variable)).toEqual([
      "SUPABASE_URL",
    ]);
  });

  it("refuses a real adapter", () => {
    const problems = check({ ...local, AI_PROVIDER: "cloudflare" });

    expect(problems).toEqual([
      expect.objectContaining({
        variable: "AI_PROVIDER",
        reason: expect.stringContaining("cloudflare"),
      }),
    ]);
  });

  it("refuses a real chat adapter too, in a file or the shell", () => {
    for (const name of [".env.local", "the shell"]) {
      const problems = checkEnvironment([
        { name, values: { ...local, AI_CHAT_PROVIDER: "cloudflare" } },
      ]);
      expect(problems).toEqual([
        expect.objectContaining({ variable: "AI_CHAT_PROVIDER", source: name }),
      ]);
    }
  });

  it("allows this machine's token in .env.development.local only", () => {
    expect(PROVIDER_KEY_FILE).toBe(".env.development.local");
    expect(
      checkEnvironment([{ name: ".env.development.local", values: token }]),
    ).toEqual([]);
    for (const name of [
      ".env.local",
      ".env",
      ".env.development",
      ".env.production.local",
      "the shell",
    ]) {
      expect(
        checkEnvironment([{ name, values: { ...local, ...token } }]).map(
          (problem) => [problem.source, problem.variable],
        ),
      ).toEqual([
        [name, "CLOUDFLARE_ACCOUNT_ID"],
        [name, "CLOUDFLARE_API_TOKEN"],
      ]);
    }
  });

  it("keeps the other rules inside that file", () => {
    const values = {
      ...token,
      AI_PROVIDER: "cloudflare",
      AI_CHAT_PROVIDER: "cloudflare",
      SUPABASE_URL: "https://abcd.supabase.co",
    };
    for (const options of [{}, { realChat: true }]) {
      expect(
        checkEnvironment([{ name: PROVIDER_KEY_FILE, values }], options).map(
          (problem) => problem.variable,
        ),
      ).toEqual(["SUPABASE_URL", "AI_PROVIDER", "AI_CHAT_PROVIDER"]);
    }
  });

  it("refuses an account ID that isn't one, without echoing it", () => {
    const problems = checkEnvironment([
      {
        name: PROVIDER_KEY_FILE,
        values: { ...token, CLOUDFLARE_ACCOUNT_ID: "not-an-account-id" },
      },
    ]);
    expect(problems).toEqual([
      expect.objectContaining({ variable: "CLOUDFLARE_ACCOUNT_ID" }),
    ]);
    expect(problems.map((problem) => problem.reason).join(" ")).not.toContain(
      "not-an-account-id",
    );
  });

  it("cuts a long adapter value short, in case it's a pasted token", () => {
    const problems = check({
      ...local,
      AI_CHAT_PROVIDER: "abcdefghijklmnopqrstuvwxyz0123456789",
    });
    expect(problems.map((problem) => problem.reason).join(" ")).not.toContain(
      "qrstuvwxyz",
    );
  });

  describe("for the real chat model", () => {
    const sources = [{ name: ".env.local", values: local }];

    it("insists on the token in its file", () => {
      const problems = checkEnvironment(sources, { realChat: true });
      expect(problems.every((problem) => problem.missing)).toBe(true);
      expect(problems).toEqual([
        expect.objectContaining({
          source: PROVIDER_KEY_FILE,
          variable: "CLOUDFLARE_ACCOUNT_ID",
          reason: expect.stringContaining("missing"),
        }),
        expect.objectContaining({
          source: PROVIDER_KEY_FILE,
          variable: "CLOUDFLARE_API_TOKEN",
        }),
      ]);
      expect(
        checkEnvironment(
          [...sources, { name: PROVIDER_KEY_FILE, values: token }],
          { realChat: true },
        ),
      ).toEqual([]);
    });

    it("still refuses the token anywhere else", () => {
      const problems = checkEnvironment(
        [
          { name: ".env.local", values: { ...local, ...token } },
          { name: PROVIDER_KEY_FILE, values: token },
        ],
        { realChat: true },
      );
      expect(
        problems.map((problem) => [problem.source, problem.variable]),
      ).toEqual([
        [".env.local", "CLOUDFLARE_ACCOUNT_ID"],
        [".env.local", "CLOUDFLARE_API_TOKEN"],
      ]);
    });

    it("finds its file wherever it sits among the sources", () => {
      expect(
        checkEnvironment(
          [
            { name: "the shell", values: {} },
            { name: PROVIDER_KEY_FILE, values: token },
            { name: ".env.local", values: local },
          ],
          { realChat: true },
        ),
      ).toEqual([]);
    });

    it("names what a half-filled file lacks", () => {
      const half = {
        name: PROVIDER_KEY_FILE,
        values: { CLOUDFLARE_ACCOUNT_ID: token.CLOUDFLARE_ACCOUNT_ID },
      };
      expect(
        checkEnvironment([...sources, half], { realChat: true }).map(
          (problem) => problem.variable,
        ),
      ).toEqual(["CLOUDFLARE_API_TOKEN"]);
    });

    it("keeps everything else local", () => {
      const problems = checkEnvironment(
        [
          {
            name: ".env.local",
            values: {
              ...local,
              AI_PROVIDER: "cloudflare",
              SUPABASE_URL: "https://abcd.supabase.co",
            },
          },
          { name: PROVIDER_KEY_FILE, values: token },
        ],
        { realChat: true },
      );
      expect(problems.map((problem) => problem.variable)).toEqual([
        "SUPABASE_URL",
        "AI_PROVIDER",
      ]);
    });
  });

  it("checks every source, not just the first", () => {
    const problems = checkEnvironment([
      { name: "the shell", values: local },
      {
        name: ".env.production.local",
        values: { SUPABASE_URL: "https://abcd.supabase.co" },
      },
    ]);
    expect(problems.map((problem) => problem.source)).toEqual([
      ".env.production.local",
    ]);
  });

  it.each([
    ["http://localhost:3000", true],
    ["http://[::1]:57321", true],
    ["https://abcd.supabase.co", false],
    ["not a url", false],
  ])("treats %s as local: %s", (address, expected) => {
    expect(isLocalAddress(address)).toBe(expected);
  });
});
