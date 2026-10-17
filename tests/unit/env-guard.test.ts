import { describe, expect, it } from "vitest";
import { checkEnvironment, isLocalAddress } from "@/lib/env-guard";

const local = {
  SUPABASE_URL: "http://127.0.0.1:57321",
  SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  AI_PROVIDER: "fake",
};

function check(values: Record<string, string | undefined>) {
  return checkEnvironment([{ name: ".env.local", values }]);
}

describe("the environment guard", () => {
  it("lets the local stack and the fake adapter through", () => {
    expect(check(local)).toEqual([]);
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
    const problems = check({ ...local, AI_PROVIDER: "mistral" });

    expect(problems).toEqual([
      expect.objectContaining({
        variable: "AI_PROVIDER",
        reason: expect.stringContaining("mistral"),
      }),
    ]);
  });

  it("refuses a real provider key", () => {
    const problems = check({ ...local, MISTRAL_API_KEY: "not-a-real-key" });
    expect(problems.map((problem) => problem.variable)).toEqual([
      "MISTRAL_API_KEY",
    ]);
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
