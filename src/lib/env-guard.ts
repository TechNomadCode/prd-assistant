// The environment guard: development and CI commands may only touch the local
// stack and the fake adapters. `scripts/env-guard.ts` runs this before every
// dev, build, test and database command.

export type EnvSource = {
  /** Where the values came from, such as ".env.local" or "the shell". */
  name: string;
  values: Record<string, string | undefined>;
};

export type GuardProblem = {
  source: string;
  variable: string;
  reason: string;
};

/** Variables that hold a database or API address. */
const ADDRESS_VARIABLES = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
] as const;

/** Variables that choose an adapter, with the only value allowed here. */
const ADAPTER_VARIABLES = { AI_PROVIDER: "fake" } as const;

/** Real provider keys, which never belong on a development machine. */
const PROVIDER_KEY_VARIABLES = ["MISTRAL_API_KEY"] as const;

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

export function checkEnvironment(sources: EnvSource[]): GuardProblem[] {
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
          reason: `is "${value}". Only the "${allowed}" adapter runs on this machine.`,
        });
      }
    }

    for (const variable of PROVIDER_KEY_VARIABLES) {
      if (values[variable]) {
        problems.push({
          source: name,
          variable,
          reason:
            "is set. Real provider keys belong only in the hosted environments.",
        });
      }
    }
  }

  return problems;
}
