import { describe, expect, it } from "vitest";
import {
  admitMessage,
  limitApplies,
  utcDay,
  visitorAddress,
  visitorKey,
  visitorNetwork,
} from "@/server/rate-limit";

// The rate limit's parts that need no database: which address stands for a
// visitor, the key it becomes, and when the limit applies at all. The
// counting itself runs against the local database in
// tests/integration/rate-limit.test.ts and supabase/tests/database/.

const SECRET = "a-test-secret";

const headers = (forwardedFor?: string) =>
  new Headers(
    forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
  );

describe("the visitor's address", () => {
  it("is the address Vercel puts in x-forwarded-for", () => {
    expect(visitorAddress(headers("203.0.113.7"))).toBe("203.0.113.7");
    expect(visitorAddress(headers("2001:db8::1"))).toBe("2001:db8::1");
  });

  it("is the first entry when a proxy added more", () => {
    expect(visitorAddress(headers(" 203.0.113.7 , 10.0.0.1"))).toBe(
      "203.0.113.7",
    );
  });

  it("is one shared stand-in when there's no usable address", () => {
    expect(visitorAddress(headers())).toBe("unknown");
    expect(visitorAddress(headers(""))).toBe("unknown");
    expect(visitorAddress(headers("not an address"))).toBe("unknown");
  });
});

describe("the visitor's network", () => {
  it("is an IPv4 address whole", () => {
    expect(visitorNetwork("203.0.113.7")).toBe("203.0.113.7");
  });

  it("is an IPv6 address's first 64 bits, however it's written", () => {
    const network = "2001:0db8:0001:0002::/64";
    expect(visitorNetwork("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(network);
    expect(visitorNetwork("2001:db8:1:2::1")).toBe(network);
    expect(visitorNetwork("2001:DB8:1:2:0:0:0:9")).toBe(network);
    expect(visitorNetwork("2001:db8::")).toBe("2001:0db8:0000:0000::/64");
    expect(visitorNetwork("::1")).toBe("0000:0000:0000:0000::/64");
  });

  it("is the IPv4 address inside an IPv4-mapped IPv6 address", () => {
    expect(visitorNetwork("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });
});

describe("the visitor's key", () => {
  const day = "2026-10-26";

  it("is 64 hexadecimal characters that hold no part of the address", () => {
    const key = visitorKey("203.0.113.7", day, SECRET);

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("203");
    expect(key).toBe(visitorKey("203.0.113.7", day, SECRET));
  });

  it("is one key for every address in an IPv6 visitor's network", () => {
    expect(visitorKey("2001:db8:1:2::1", day, SECRET)).toBe(
      visitorKey("2001:db8:1:2::ffff", day, SECRET),
    );
    expect(visitorKey("2001:db8:1:2::1", day, SECRET)).not.toBe(
      visitorKey("2001:db8:1:3::1", day, SECRET),
    );
  });

  it("changes with the address, the day and the secret", () => {
    const key = visitorKey("203.0.113.7", day, SECRET);

    expect(visitorKey("203.0.113.8", day, SECRET)).not.toBe(key);
    expect(visitorKey("203.0.113.7", "2026-10-27", SECRET)).not.toBe(key);
    expect(visitorKey("203.0.113.7", day, "another-secret")).not.toBe(key);
  });

  it("counts by the UTC day", () => {
    expect(utcDay(new Date("2026-10-26T23:59:59Z"))).toBe("2026-10-26");
    expect(utcDay(new Date("2026-10-27T00:00:00Z"))).toBe("2026-10-27");
    expect(utcDay(new Date("2026-10-27T01:30:00+02:00"))).toBe("2026-10-26");
  });
});

describe("when the limit applies", () => {
  it("applies only when the chat runs on the real model", () => {
    expect(limitApplies({ provider: "cloudflare" })).toBe(true);
    expect(limitApplies({ provider: "fake", chatProvider: "cloudflare" })).toBe(
      true,
    );
    expect(limitApplies({ provider: "fake" })).toBe(false);
    expect(limitApplies({ provider: "fake", chatProvider: "replay" })).toBe(
      false,
    );
  });

  it("lets every message through on the fakes, without the database", async () => {
    const request = new Request("http://localhost/api/chat", {
      headers: { "x-forwarded-for": "203.0.113.7" },
    });

    await expect(
      admitMessage(request, { env: { AI_PROVIDER: "fake" } }),
    ).resolves.toBe(true);
  });

  it("refuses to run on the real model without the secret key", async () => {
    const request = new Request("http://localhost/api/chat");

    await expect(
      admitMessage(request, {
        env: { AI_PROVIDER: "cloudflare", SUPABASE_URL: "http://127.0.0.1:1" },
      }),
    ).rejects.toThrow(/settings for the rate limit/);
  });
});
