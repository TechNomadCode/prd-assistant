// Checks that this machine has what the project needs. Run `npm run doctor`
// after cloning, and whenever a command fails in a way that looks like setup.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

type Result = { ok: boolean; required: boolean; label: string; detail: string };

function run(command: string) {
  const result = spawnSync(command, { shell: true, encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

const results: Result[] = [];
function check(
  label: string,
  required: boolean,
  test: () => [boolean, string],
) {
  const [ok, detail] = test();
  results.push({ ok, required, label, detail });
}

const pinnedNode = readFileSync(".nvmrc", "utf8").trim();
check("Node.js", true, () => {
  const major = process.versions.node.split(".")[0];
  return major === pinnedNode
    ? [true, `v${process.versions.node}`]
    : [
        false,
        `v${process.versions.node}, but the project pins Node ${pinnedNode} (.nvmrc), like CI and Vercel. Install Node ${pinnedNode} and switch to it.`,
      ];
});

check("Git", true, () => {
  const git = run("git --version");
  return git.ok
    ? [true, git.output]
    : [false, "not found. Install Git from https://git-scm.com."];
});

check("Docker", true, () => {
  const docker = run("docker info --format {{.ServerVersion}}");
  return docker.ok
    ? [true, `engine ${docker.output}`]
    : [
        false,
        "not running. Start Docker Desktop: the local database runs inside it.",
      ];
});

check("Supabase CLI", true, () => {
  const pinned = JSON.parse(readFileSync("package.json", "utf8"))
    .devDependencies.supabase;
  const cli = run("npx supabase --version");
  // npm adds its own notices to the output, so look for the version itself.
  const version = /\b\d+\.\d+\.\d+\b/.exec(cli.output)?.[0] ?? "unknown";
  if (!cli.ok) return [false, "not installed. Run `npm ci`."];
  return version === pinned
    ? [true, version]
    : [false, `${version}, but package.json pins ${pinned}. Run \`npm ci\`.`];
});

check("Secret scanner (gitleaks)", true, () => {
  const gitleaks = run("gitleaks version");
  return gitleaks.ok
    ? [true, gitleaks.output]
    : [
        false,
        "not found. Install it from https://github.com/gitleaks/gitleaks#installing.",
      ];
});

check("GitHub CLI", false, () => {
  const gh = run("gh auth status");
  if (gh.ok) return [true, "signed in"];
  return run("gh --version").ok
    ? [
        false,
        "not signed in. Run `gh auth login` before opening pull requests from the terminal.",
      ]
    : [false, "not installed (optional): https://cli.github.com."];
});

for (const { ok, required, label, detail } of results) {
  const mark = ok ? "ok  " : required ? "FAIL" : "warn";
  console.log(`${mark}  ${label}: ${detail}`);
}

const failed = results.filter((result) => result.required && !result.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} required check(s) failed.`);
  process.exit(1);
}
console.log("\nAll required checks passed.");
