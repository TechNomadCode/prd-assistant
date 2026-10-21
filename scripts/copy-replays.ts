// Copies a few counted runs of each measured request into the project, for
// `npm run dev:replay` (src/server/ai/replays.ts). It only reads the
// measurement's records, which are git-ignored, so it runs where they are:
// the main checkout, or a worktree given `--from` with the main checkout's
// measurement folder. It never writes there.
//
//   npm run replays:copy -- --from <folder of one measurement>
//
// Per request, runs whose last call wrote words come first, then the others,
// each by run number, so the intro's button replays a worded answer first.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import {
  endsWithWords,
  isReplayable,
  REPLAYS_FILE,
  REPLAYS_PER_REQUEST,
  toRecording,
  type MeasuredRecord,
  type Recording,
  type Replays,
} from "../src/server/ai/replays.ts";
import { REQUESTS } from "../src/server/measurement/requests.ts";

const { values } = parseArgs({
  options: {
    from: { type: "string", default: "docs/records/measurements/baseline" },
  },
});
const from = values.from;

const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;

type Found = { record: MeasuredRecord; recordedOn: string };

const found: Found[] = readdirSync(from)
  .filter((entry) => UTC_DAY.test(entry))
  .flatMap((day) =>
    readdirSync(join(from, day))
      .filter((file) => file.endsWith(".json"))
      .map((file) => ({
        record: JSON.parse(
          readFileSync(join(from, day, file), "utf8"),
        ) as MeasuredRecord,
        recordedOn: day,
      })),
  );

const recordings: Recording[] = REQUESTS.flatMap((request) =>
  found
    .filter(
      ({ record }) =>
        record.setup.request === request.name && isReplayable(record),
    )
    .sort(
      (a, b) =>
        Number(endsWithWords(b.record)) - Number(endsWithWords(a.record)) ||
        a.record.setup.run - b.record.setup.run,
    )
    .slice(0, REPLAYS_PER_REQUEST)
    .map(({ record, recordedOn }) =>
      toRecording(record, { recordedOn, words: request.text }),
    ),
);

const replays: Replays = {
  format: 1,
  measurement: basename(from),
  recordings,
};

writeFileSync(REPLAYS_FILE, `${JSON.stringify(replays, null, 2)}\n`);

console.log(
  `Copied ${recordings.length} runs of "${replays.measurement}" into ${REPLAYS_FILE}: ${recordings.map((recording) => recording.id).join(", ")}.`,
);
for (const request of REQUESTS) {
  const copied = recordings.filter((recording) =>
    recording.id.startsWith(`${request.name}-`),
  ).length;
  if (copied < REPLAYS_PER_REQUEST) {
    console.log(
      `Request ${request.name}: ${copied} of ${REPLAYS_PER_REQUEST} wanted.`,
    );
  }
}
