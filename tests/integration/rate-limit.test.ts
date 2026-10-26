import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";
import { DAILY_LIMIT_REACHED, DAILY_MESSAGE_LIMIT } from "@/lib/chat";
import { createReadClient, createWriteClient } from "@/server/db/clients";
import { readAppEnv, readRateLimitEnv } from "@/server/env";
import { admitMessage, utcDay, visitorKey } from "@/server/rate-limit";

// The rate limit end to end against the local database: the server counts each
// visitor's messages with the secret key, and the chat's endpoint refuses the
// one after the day's limit before any model is called. The local settings run
// the fakes, which the limit leaves alone, so these tests set the provider to
// Cloudflare's; nothing here reaches Cloudflare.

const REAL = { ...process.env, AI_PROVIDER: "cloudflare" };

const counts = () =>
  createWriteClient(readRateLimitEnv()).from("message_counts");

function from(address: string, body?: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "x-forwarded-for": address },
    body,
  });
}

async function admitted(address: string, times: number) {
  const results: boolean[] = [];
  for (let i = 0; i < times; i++) {
    results.push(await admitMessage(from(address), { env: REAL }));
  }
  return results;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  // Every test leaves the database holding the notes and nothing else.
  const { error } = await counts().delete().gte("messages", 0);
  if (error) throw error;
});

describe("the rate limit", () => {
  it(`lets a visitor send ${DAILY_MESSAGE_LIMIT} messages a day and refuses the next`, async () => {
    expect(await admitted("203.0.113.7", DAILY_MESSAGE_LIMIT + 2)).toEqual([
      ...Array(DAILY_MESSAGE_LIMIT).fill(true),
      false,
      false,
    ]);
  });

  it("counts each visitor apart, an IPv6 visitor by their network", async () => {
    await admitted("203.0.113.7", DAILY_MESSAGE_LIMIT);
    await admitted("2001:db8:1:2::1", DAILY_MESSAGE_LIMIT);

    expect(await admitted("203.0.113.8", 1)).toEqual([true]);
    expect(await admitted("2001:db8:1:2::ffff", 1)).toEqual([false]);
    expect(await admitted("2001:db8:1:3::1", 1)).toEqual([true]);
  });

  it("stores the day's keyed hash, never the address", async () => {
    await admitted("203.0.113.7", 2);

    const { data, error } = await counts().select("*");
    expect(error).toBeNull();
    const today = utcDay(new Date());
    expect(data).toEqual([
      {
        visitor: visitorKey(
          "203.0.113.7",
          today,
          readRateLimitEnv().SUPABASE_SECRET_KEY,
        ),
        day: today,
        messages: 2,
      },
    ]);
    expect(JSON.stringify(data)).not.toContain("203.0.113");
  });

  it("counts nothing while the chat runs on the fakes", async () => {
    expect(
      await admitMessage(from("203.0.113.7"), {
        env: { ...process.env, AI_PROVIDER: "fake" },
      }),
    ).toBe(true);

    const { count } = await counts().select("*", {
      count: "exact",
      head: true,
    });
    expect(count).toBe(0);
  });

  it("can't be reached with the app's read key", async () => {
    const read = createReadClient(readAppEnv());

    const counted = await read.rpc("take_message", {
      visitor_hash: "a".repeat(64),
      daily_limit: 10,
    });
    expect(counted.error?.code).toBe("42501");
    const listed = await read.from("message_counts").select("*");
    expect(listed.error?.code).toBe("42501");
  });
});

describe("the chat's endpoint at the limit", () => {
  const body = JSON.stringify({
    messages: [
      { id: "visitor-1", role: "user", parts: [{ type: "text", text: "Hi" }] },
    ],
  });

  it("refuses the visitor's next message with the friendly words, before any model", async () => {
    await admitted("203.0.113.7", DAILY_MESSAGE_LIMIT);
    vi.stubEnv("AI_PROVIDER", "cloudflare");

    const refused = await POST(from("203.0.113.7", body));

    expect(refused.status).toBe(429);
    expect(await refused.text()).toBe(DAILY_LIMIT_REACHED);
  });

  it("doesn't count a request it can't read", async () => {
    vi.stubEnv("AI_PROVIDER", "cloudflare");

    expect((await POST(from("203.0.113.7", "not json"))).status).toBe(400);

    const { count } = await counts().select("*", {
      count: "exact",
      head: true,
    });
    expect(count).toBe(0);
  });
});
