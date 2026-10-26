import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

// The data layer's two database clients. Both run only on the server: the app
// never sends a Supabase key to the browser.
//
// - The read client uses the publishable key, so it acts as the `anon` role:
//   it can read transcript text and nothing else (supabase/schemas/).
// - The write client uses the secret key (`service_role`): the notes loader,
//   which runs in CI for hosted databases, and the rate limit, which counts
//   each visitor's messages on the server (`rate-limit.ts`).

const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

export function createReadClient(settings: {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}) {
  return createClient<Database>(
    settings.SUPABASE_URL,
    settings.SUPABASE_PUBLISHABLE_KEY,
    options,
  );
}

export function createWriteClient(settings: {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
}) {
  return createClient<Database>(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY,
    options,
  );
}

export type DbClient = ReturnType<typeof createReadClient>;
