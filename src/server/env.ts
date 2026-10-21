import { z } from "zod";
import {
  AI_PROVIDERS,
  CHAT_PROVIDERS,
  type ProviderSettings,
} from "./ai/providers.ts";

// Each part of the app reads only the settings it needs, checked here, so a
// missing or mistyped value fails with a clear message instead of halfway
// through a request.

type Settings = Record<string, string | undefined>;

function read<T extends z.ZodType>(
  schema: T,
  env: Settings,
  purpose: string,
): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `Missing or invalid settings for ${purpose}:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

const appSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

/** What the app needs to read the transcripts. */
export function readAppEnv(env: Settings = process.env) {
  return read(appSchema, env, "the app");
}

const aiSchema = z.object({
  AI_PROVIDER: z.enum(AI_PROVIDERS),
  // The chat model's adapter alone; `npm run dev:real` and `npm run
  // dev:replay` set it for the dev server. An empty line in an env file means
  // unset, like a missing one.
  AI_CHAT_PROVIDER: z.union([z.enum(CHAT_PROVIDERS), z.literal("")]).optional(),
  // How many times faster than recorded the replay runs; the end-to-end
  // tests shorten its waits with it.
  REPLAY_SPEED: z.coerce.number().min(1).optional(),
  // 32 hexadecimal characters, so a token pasted here by mistake is refused.
  CLOUDFLARE_ACCOUNT_ID: z
    .string()
    .regex(/^[0-9a-f]{32}$/, "Use the 32-character account ID.")
    .optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
});

/** The provider's part of the checked settings, as the providers take it. */
export function providerSettings(
  env: z.infer<typeof aiSchema>,
): ProviderSettings {
  return {
    provider: env.AI_PROVIDER,
    chatProvider: env.AI_CHAT_PROVIDER || undefined,
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
    replaySpeed: env.REPLAY_SPEED,
  };
}

/** What the chat needs: a chat model. Its search reads its own settings. */
export function readChatEnv(env: Settings = process.env) {
  return read(aiSchema, env, "the chat");
}

const searchSchema = appSchema.extend(aiSchema.shape);

/** What the interview search needs: the read key and an embedder. */
export function readSearchEnv(env: Settings = process.env) {
  return read(searchSchema, env, "the interview search");
}

const loaderSchema = z
  .object({
    SUPABASE_URL: z.url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
  })
  .extend(aiSchema.shape);

/** What the notes loader needs: the write key and an embedder. */
export function readLoaderEnv(env: Settings = process.env) {
  return read(loaderSchema, env, "the notes loader");
}
