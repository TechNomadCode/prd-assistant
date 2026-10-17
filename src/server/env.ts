import { z } from "zod";
import { AI_PROVIDERS } from "./ai/providers.ts";

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

const loaderSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  AI_PROVIDER: z.enum(AI_PROVIDERS),
  MISTRAL_API_KEY: z.string().optional(),
});

/** What the notes loader needs: the write key and an embedder. */
export function readLoaderEnv(env: Settings = process.env) {
  return read(loaderSchema, env, "the notes loader");
}
