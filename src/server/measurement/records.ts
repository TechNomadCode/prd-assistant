import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Where a measured answer's record goes, and the last check before it does:
// a record that holds the token, or "Bearer " anywhere, is refused whole and
// nothing is written or printed (docs/plan.md, slice 9a). `docs/records/` is
// git-ignored, so the records stay on this machine.

export const MEASUREMENTS_DIR = "docs/records/measurements";

/** A request's name, such as "A" or "C2", safe as part of a file name. */
const REQUEST_NAME = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

const BEARER = /bearer\s/i;

export class RecordRefusedError extends Error {
  constructor(what: string) {
    // Never the record itself, nor the secret.
    super(`The record contains ${what}, so it wasn't written.`);
    this.name = "RecordRefusedError";
  }
}

export type RecordSecrets = {
  /** The API token; an empty one is ignored. */
  token?: string | undefined;
  /** Replaced by `<account>` wherever it appears. */
  accountId?: string | undefined;
};

/** The record as written, or a `RecordRefusedError`. */
export function serializeRecord(
  record: unknown,
  { token, accountId }: RecordSecrets = {},
): string {
  let json = JSON.stringify(record, null, 2);
  if (accountId) json = json.replaceAll(accountId, "<account>");
  if (token) {
    // As it would appear inside a JSON string, too.
    const escaped = JSON.stringify(token).slice(1, -1);
    if (json.includes(token) || json.includes(escaped)) {
      throw new RecordRefusedError("the API token");
    }
  }
  if (BEARER.test(json)) throw new RecordRefusedError('"Bearer "');
  return `${json}\n`;
}

/** A request's name and run number, fit for a record's file name. */
export function checkRunName({
  request,
  run,
}: {
  request: string;
  run: number;
}) {
  if (!REQUEST_NAME.test(request)) {
    throw new Error(`"${request}" isn't a request's name, such as A or C2.`);
  }
  if (!Number.isInteger(run) || run < 1) {
    throw new Error(`Run ${run} isn't a run number, which counts from 1.`);
  }
}

/** `<root>/<UTC date>/<request>-<run>.json` */
export function recordPath(
  root: string,
  { time, request, run }: { time: Date; request: string; run: number },
): string {
  checkRunName({ request, run });
  const date = time.toISOString().slice(0, 10);
  return join(root, date, `${request}-${run}.json`);
}

/**
 * Writes the record, after the check. Never overwrites: an existing file is
 * an earlier run's record, so it fails instead.
 */
export async function writeRecord(
  path: string,
  record: unknown,
  secrets: RecordSecrets = {},
): Promise<number> {
  const json = serializeRecord(record, secrets);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json, { flag: "wx" });
  return Buffer.byteLength(json);
}
