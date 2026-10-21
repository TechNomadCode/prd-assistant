// Starts the dev server with the chat on the real model's recorded answers
// (src/server/ai/replay-chat-model.ts), for watching the interface with real
// replies and their real waits, for free. It sends nothing to Cloudflare and
// the replay reads no token. Like `dev:real`, it sets AI_CHAT_PROVIDER for the
// dev server, which no env file can undo (Next.js, "Environment variable load
// order", read 2026-10-19), and NEXT_PUBLIC_CHAT_REPLAY, which the header
// shows; Next.js inlines a NEXT_PUBLIC_ variable from the environment when it
// compiles (read 2026-10-21 through Context7). The search keeps the fake
// embedder and the local database. `npm run dev:replay` runs the guard first.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");

console.log(
  [
    "Dev server with the chat on recorded answers: the measurement's real gpt-oss-120b replies, replayed with their real waits.",
    "The intro's button, the grocery delivery suggestion and the other measured requests replay; any other message gets the fake model, paced the same way.",
    "Nothing is sent to Cloudflare. The searches and saves run here, on the local database and the fake embedder.",
    "",
  ].join("\n"),
);

const server = spawn(
  process.execPath,
  [next, "dev", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      AI_CHAT_PROVIDER: "replay",
      NEXT_PUBLIC_CHAT_REPLAY: "1",
    },
  },
);
server.on("error", (error) => {
  console.error(`The dev server didn't start: ${error.message}`);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
