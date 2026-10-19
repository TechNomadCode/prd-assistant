// Starts the dev server with the chat on the real model: Cloudflare Workers AI
// with this machine's own token from `.env.development.local`, which `next dev`
// loads (Next.js, "Environment variable load order", read 2026-10-19: a
// variable already in the environment wins over every env file, so the
// AI_CHAT_PROVIDER set here can't be undone by one). The search keeps the fake
// embedder: the local passages carry its vectors. `npm run dev:real` runs the
// guard with `--real-chat` first, then this. Every other command keeps the
// fakes, except the measurement (`npm run measure`).

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");

console.log(
  [
    "Dev server with the chat on the real model: gpt-oss-120b on Cloudflare Workers AI, with this machine's token.",
    "Every message spends neurons from the daily free allocation that staging and production share.",
    "The search still runs on the fake embedder; tests and builds never touch the real model.",
    "",
  ].join("\n"),
);

const server = spawn(
  process.execPath,
  [next, "dev", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, AI_CHAT_PROVIDER: "cloudflare" },
  },
);
server.on("error", (error) => {
  console.error(`The dev server didn't start: ${error.message}`);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
