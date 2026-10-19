import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// One measurement batch at a time on this machine, across sessions and
// worktrees (src/server/AGENTS.md, the budget): a lock file in the system's
// temporary folder, which every checkout shares. It's created only if it
// doesn't exist (`wx`); a lock whose process has ended is taken over, since
// that batch can't be running any more (`process.kill(pid, 0)` tests whether
// a process exists, on Windows too: https://nodejs.org/docs/latest-v24.x/api/process.html#processkillpid-signal,
// read 2026-10-19 through Context7).

export const LOCK_FILE = join(tmpdir(), "prd-assistant-measurement.lock");

type LockHolder = { pid: number; since: string; folder: string };

export class MeasurementLockedError extends Error {
  constructor(holder: LockHolder, file: string) {
    super(
      `Another measurement batch is running (process ${holder.pid}, since ${holder.since}, in ${holder.folder}). One batch at a time: wait for it to finish. If none is running, delete ${file}.`,
    );
    this.name = "MeasurementLockedError";
  }
}

export type Lock = {
  /** Set when an ended batch's lock was taken over. */
  tookOver: LockHolder | null;
  release(): void;
};

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists, but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function acquireLock(file: string = LOCK_FILE): Lock {
  const mine: LockHolder = {
    pid: process.pid,
    since: new Date().toISOString(),
    folder: process.cwd(),
  };
  let tookOver: LockHolder | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, JSON.stringify(mine), { flag: "wx" });
      return {
        tookOver,
        release() {
          try {
            const holder = JSON.parse(readFileSync(file, "utf8")) as LockHolder;
            if (holder.pid === mine.pid && holder.since === mine.since) {
              rmSync(file);
            }
          } catch {
            // Already gone.
          }
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let holder: LockHolder;
      try {
        holder = JSON.parse(readFileSync(file, "utf8")) as LockHolder;
      } catch {
        throw new Error(
          `The measurement's lock file can't be read: ${file}. If no batch is running, delete it.`,
        );
      }
      if (isRunning(holder.pid)) throw new MeasurementLockedError(holder, file);
      rmSync(file, { force: true });
      tookOver = holder;
    }
  }
  throw new Error(`The measurement's lock couldn't be taken: ${file}.`);
}
