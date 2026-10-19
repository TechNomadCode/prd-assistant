// The environment guard: development and CI commands may only touch the local
// stack and the fake adapters. `scripts/env-guard.ts` runs this before every
// dev, build, test and database command. One exception, the owner's
// (docs/decisions.md, 2026-10-19): a Workers AI token of this machine's own may
// sit in `.env.development.local`, which only `next dev` reads, and
// `npm run dev:real` runs the chat on the real model with it.

export type EnvSource = {
  /** Where the values came from, such as ".env.local" or "the shell". */
  name: string;
  values: Record<string, string | undefined>;
};

export type GuardProblem = {
  source: string;
  variable: string;
  reason: string;
  /** The token file lacks this, and the command needs it. */
  missing?: true;
};

export type GuardOptions = {
  /** The command runs the chat on the real model, so its token must be there. */
  realChat?: boolean;
};

/** Variables that hold a database or API address. */
const ADDRESS_VARIABLES = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
] as const;

/** Variables that choose an adapter, with the only value allowed here. */
const ADAPTER_VARIABLES = {
  AI_PROVIDER: "fake",
  AI_CHAT_PROVIDER: "fake",
} as const;

/** The real provider's settings, allowed in one file only. */
const PROVIDER_KEY_VARIABLES = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
] as const;

/** The one file that may hold them: `next dev` reads it, nothing else does. */
export const PROVIDER_KEY_FILE = ".env.development.local";

/** 32 hexadecimal characters, as `src/server/env.ts` checks too. */
const ACCOUNT_ID = /^[0-9a-f]{32}$/;

/** A value shown in a message, cut short in case it's a pasted secret. */
function shown(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "0.0.0.0",
  "host.docker.internal",
]);

export function isLocalAddress(value: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function checkEnvironment(
  sources: EnvSource[],
  options: GuardOptions = {},
): GuardProblem[] {
  const problems: GuardProblem[] = [];

  for (const { name, values } of sources) {
    for (const variable of ADDRESS_VARIABLES) {
      const value = values[variable];
      if (value && !isLocalAddress(value)) {
        problems.push({
          source: name,
          variable,
          reason:
            "isn't a local address. Only the local stack runs on this machine.",
        });
      }
    }

    for (const [variable, allowed] of Object.entries(ADAPTER_VARIABLES)) {
      const value = values[variable];
      if (value && value !== allowed) {
        problems.push({
          source: name,
          variable,
          reason: `is "${shown(value)}". Only the "${allowed}" adapter runs on this machine; the real chat model runs through \`npm run dev:real\`.`,
        });
      }
    }

    for (const variable of PROVIDER_KEY_VARIABLES) {
      if (values[variable] && name !== PROVIDER_KEY_FILE) {
        problems.push({
          source: name,
          variable,
          reason: `is set. On this machine the real provider's settings belong only in ${PROVIDER_KEY_FILE}, which only the dev server reads.`,
        });
      }
    }

    // A mistyped account ID would otherwise stop the first message, also on
    // the fakes, since `next dev` reads the file whatever the adapter.
    const accountId = values.CLOUDFLARE_ACCOUNT_ID;
    if (
      name === PROVIDER_KEY_FILE &&
      accountId &&
      !ACCOUNT_ID.test(accountId)
    ) {
      problems.push({
        source: name,
        variable: "CLOUDFLARE_ACCOUNT_ID",
        reason:
          "isn't a 32-character account ID (digits and the letters a to f). Copy it from the Workers AI page.",
      });
    }
  }

  if (options.realChat) {
    const keyFile = sources.find((source) => source.name === PROVIDER_KEY_FILE);
    for (const variable of PROVIDER_KEY_VARIABLES) {
      if (!keyFile?.values[variable]) {
        problems.push({
          source: PROVIDER_KEY_FILE,
          variable,
          reason:
            'is missing. The real chat model needs this machine\'s own Workers AI token there (README, "The real chat model on your machine").',
          missing: true,
        });
      }
    }
  }

  return problems;
}
