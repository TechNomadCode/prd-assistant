import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { DAILY_MESSAGE_LIMIT } from "@/lib/chat";
import type { ProviderSettings } from "./ai/providers.ts";
import { createWriteClient } from "./db/clients.ts";
import { providerSettings, readChatEnv, readRateLimitEnv } from "./env.ts";

// The per-visitor rate limit: each visitor may send DAILY_MESSAGE_LIMIT
// messages a UTC day, so one visitor can't use up Cloudflare's free daily
// allocation, which every visitor shares. A visitor is recognised by their IP
// address, hashed here with the day and a server secret before anything
// reaches the database (`supabase/schemas/rate-limit.sql`), so no address is
// stored and one day's count can't be linked to the next. Only messages to the
// real model count: the fakes and the replayed answers cost nothing.

/** Whether the chat runs on the real model, whose allocation the limit guards. */
export function limitApplies(settings: ProviderSettings): boolean {
  return (settings.chatProvider ?? settings.provider) === "cloudflare";
}

/**
 * The visitor's address as Vercel gives it: `x-forwarded-for`, which Vercel
 * overwrites with the client's public address, so a visitor can't set it
 * (https://vercel.com/docs/headers/request-headers, read 2026-10-26). The
 * first entry, in case a proxy added more. Without a usable address, every
 * such request shares one count.
 */
export function visitorAddress(headers: Headers): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return isIP(first) ? first : "unknown";
}

/**
 * The part of an address that stands for one visitor: an IPv4 address whole,
 * and an IPv6 address's first 64 bits, since one home or phone is usually
 * given a whole /64 and could otherwise change address at will. An
 * IPv4-mapped IPv6 address counts as its IPv4 address.
 */
export function visitorNetwork(address: string): string {
  if (isIP(address) !== 6) return address;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1]) return mapped[1];
  const [head, tail] = address.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? front
      : [...front, ...Array(8 - front.length - back.length).fill("0"), ...back];
  return `${groups
    .slice(0, 4)
    .map((group) => group.padStart(4, "0"))
    .join(":")}::/64`;
}

/** The UTC day of `now`, as the database's `date` writes it. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The visitor's key for one day: an HMAC-SHA256 of the day and their network,
 * keyed with the server's secret, in 64 hexadecimal characters. Without the
 * secret, the key can't be traced back to an address by trying them all.
 */
export function visitorKey(address: string, day: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`rate-limit:${day}:${visitorNetwork(address)}`)
    .digest("hex");
}

/**
 * Counts the request's message against its visitor's day and says whether
 * it may go on. Always true when the chat isn't on the real model.
 */
export async function admitMessage(
  request: Request,
  {
    env = process.env,
    now = new Date(),
  }: { env?: Record<string, string | undefined>; now?: Date } = {},
): Promise<boolean> {
  if (!limitApplies(providerSettings(readChatEnv(env)))) return true;
  const settings = readRateLimitEnv(env);
  const visitor = visitorKey(
    visitorAddress(request.headers),
    utcDay(now),
    settings.SUPABASE_SECRET_KEY,
  );
  const { data, error } = await createWriteClient(settings).rpc(
    "take_message",
    { visitor_hash: visitor, daily_limit: DAILY_MESSAGE_LIMIT },
  );
  if (error) throw new Error(`The rate limit couldn't count: ${error.message}`);
  return data;
}
