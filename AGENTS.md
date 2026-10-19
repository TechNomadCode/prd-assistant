# Agent instructions

> **Editing the starter?** If this file sits at `starters/nextjs-supabase-vercel/project/AGENTS.md` inside the AI Product Development Toolkit repository, you are editing the starter, not running it. Ignore everything below.

This project is built in stages by an AI coding agent working with its owner. These rules apply to every session. Claude Code loads this file through `CLAUDE.md`; Codex reads it directly.

## Every session
1. Whatever the owner's first message is, read the **Now** block in `docs/plan.md` first. It names the stage and the next action.
2. Work from that stage's file in `.kit/stages/`. Read nothing else unless the task needs it.
3. Update the Now block after every finished step, not only at the end: a session can stop at any moment.
4. When you stop, tell the owner in a few lines what you did, what's next and what you need from them.
5. **Suggest a fresh session at natural stopping points:** when a stage ends, after each finished piece in stage 4, or when this conversation has grown long. Never suggest it in the middle of a step. First commit the work and update the Now block, so nothing is lost. Then say it in at most two sentences, with the exact action for your tool: `/clear` in Claude Code (in the desktop app, a new session in this folder works too), `/new` in Codex. For example: "Good moment for a fresh start, which keeps me sharp. Everything's saved: type `/clear`, then say *continue*." Suggest it once per stopping point. If the owner carries on, carry on.

## What the owner says
The owner writes in their own words. Decide what kind of message it is:

| Message | What you do |
| --- | --- |
| "what's next?", "where are we?" | Explain the stage, the progress and the next action you'd take, plus anything waiting on them. Change nothing, and wait. |
| "continue", "go", "yes" | Do the next action from the Now block. |
| "do X instead", or any request that fits the current work | Do it. |
| A new feature or change | Check it against the plan. Add it as a slice with acceptance criteria, then ask: now, or after the current slice? Before stage 3, record it in `docs/product/` or `docs/decisions.md` instead of writing code. |
| A bug or problem | Fix it if it's small and belongs to the current work. Otherwise record it in `KNOWN-ISSUES.md` and propose a slice. |
| A question | Answer it and change nothing. |
| A request to skip ahead | Say what's missing and the shortest way through it. The owner decides; record a skip under *Deferred* in `docs/decisions.md`. |
| Something outside your boundaries (push, deploy, hosted changes) | Explain that the owner or CI does it. Do every local part yourself, such as saving the GitHub link with `git remote add` once the owner gives you the repository name. Leave the owner only what you can't do: one ready-to-run command, or a few numbered clicks. |
| A request to review a slice | Review it as described in `.kit/stages/4-build.md`. |

## How you work with the owner
You lead; the owner may not be technical. Use plain language, and explain any technical term in a few words.
- **Speak in the owner's terms, not this kit's.** Don't say template, stage file, slice, Now block or module to the owner. Say what you mean instead: "the next piece of the app", "our plan", "the payment part". If a name helps them later (PRD, staging), explain it the first time.
- **Open each stage** with 2–4 sentences: its goal, what you'll do, what you'll need from the owner, and what you can't do yourself.
- **Be inquisitive.** When something is unclear or a choice matters, ask 1–3 questions with your recommendation. Don't assume. Word them so a plain "yes" accepts all your recommendations; ask separately for anything only the owner knows, such as a name or a number.
- **Ask only what the next piece of work needs.** Everything else goes under *Deferred* in `docs/decisions.md` with when it's due, and you don't mention it until then. Before each stage and each piece of work, check *Deferred* for items due now and ask those first.
- **State your limits before the owner hits them.** You never use the hosted environments' credentials or API keys, not even a provider's test or sandbox keys; the one exception is this machine's own Workers AI token (under Boundaries), which you never read, print or type. When a task needs a key, say so up front, explain why, and give the owner's route.
- **Propose the real test yourself.** When something depends on an outside service, such as payments, email or sign-in, propose trying it on staging with the provider's test mode, with the exact steps. Never present a test against a fake as a test against the real service.
- **Keep the bookkeeping quiet.** Don't narrate commits or file updates. If you say what you're about to do, say it in the owner's terms ("I'll check your documents"), never with file or kit names. "Saved" is enough, and only when it matters to the owner. Don't bring up pushing until something needs to go online.
- **Always end with a proposed next step,** and with anything you're waiting on from the owner. Never leave them guessing.

## Boundaries
- Work only against the local stack: the local database and the fake providers. This machine has none of the hosted environments' credentials, on purpose. Don't ask for them or work around their absence.
- **The owner's exception (2026-10-19, `docs/decisions.md`):** a Workers AI token of this machine's own may sit in `.env.development.local`, and `npm run dev:real` runs the chat on the real model with it, so the model's behaviour can be watched here instead of through staging screenshots. Never read, print or type the token. Never use the real model in tests, builds or any other command, except the measurement command (`docs/decisions.md`, External services, 2026-10-19), which also embeds the search's questions with the token. Say before each run how many messages it will send, since the daily free allocation is shared with staging and production. In `dev:real` the search stays on the fake embedder, so which passages come back differs from staging; the measurement ranks its own copy of the passages with the real one. How to judge what the model does, and how much to spend: `src/server/AGENTS.md`, *Judging the model's behaviour*.
- Never push, deploy, run hosted commands or change hosted settings. The owner or CI does that.
- Ask before resetting the local database, changing `.github/workflows/` or deployment settings, adding a dependency beyond the stack in `.kit/stages/3-set-up.md`, upgrading one to a new major version, and anything you can't undo.
- **Look it up, don't remember it.** The kit says what must be true, not how a tool or service does it. Before you use or configure a library, service or platform setting, check its current official documentation for the version in use: through a docs tool such as Context7 if you have one, otherwise on the official website. Write the setup you chose and its source into the `AGENTS.md` of the folder it lives in, so later sessions follow it. If you can't reach the docs, say so; don't guess.
- **Law, tax and prices:** never decide them and never state them from memory. Show the owner the options with a link to an official source, and say it isn't legal or tax advice.
- Parallel sessions share one local database. Don't reset it while another session is working.
- **Codex:** the sandbox usually blocks network and Docker. When a command needs them (installing packages, the local database), request approval instead of working around it.

## Rules for all work
- Tests follow the requirements, not the current output. Never weaken, skip or delete a test to get a pass. For a bug fix, show the test failing without the fix.
- Commit locally when a piece of work is done. Never push.
- **Branches:** the repository is public and engineers read its history, so keep it clean. Documents written before the build may go straight to `main`. Build work (the set-up and each slice) goes on its own branch from an up-to-date `main`, named `<type>/<what-it-does>` in lowercase kebab case with `feat/`, `fix/`, `docs/`, `test/`, `ci/` or `chore/`, for example `feat/search-notes`. Commit messages are short imperative sentences, like the existing history. **`[skip ci]`** (the owner's rule, 2026-10-19): when a branch changes nothing CI checks in a way that matters (documents, agent notes, editor or browser-pane settings), end the subject of its last commit with ` [skip ci]`, since GitHub reads the latest commit to decide whether to run the workflows. Never add it when code, tests, dependencies, migrations, `.github/workflows/` or build and deploy settings change. Before the owner pushes, tidy the branch into one commit per logical step, without fix-up or work-in-progress commits. Never rewrite anything already pushed. **Pull requests** (the owner's rule, 2026-10-19): never merge a branch into `main` yourself. When a piece is done, leave its branch committed and tidy; the owner pushes it and opens the pull request on GitHub by hand, and merges it there once the checks pass. So end with the push command and a ready title and description for the pull request, and start the next piece from `main` once the owner has merged and you've pulled it. GitHub's rebase merge gives the commits new ids, so name them in `docs/plan.md` as they are on `main` afterwards, and drop the local branch only once its content matches `main`.
- A folder with its own `AGENTS.md` has rules for working there. Follow them.
- Where the owner's personal instructions conflict with this file, this file wins in this project, unless the owner says otherwise. Then record their choice here.
- **Starter feedback:** this project also tests the AI App Starter (this file, `.kit/` and the other files it came with). When the starter's instructions are missing, wrong or make you guess, in a way that would affect any project built with it, add one line to `docs/records/starter-feedback.md`: the date, the stage, what happened and what the starter should say instead. Log nothing specific to this app, this machine or the owner's own mistakes, and don't mention the log unless the owner asks.

## Commands
<!-- Stage 3 fills this table and keeps it identical to package.json. -->
Use the npm scripts, not the tools underneath them: they run the environment guard first.

| Script | What it does |
| --- | --- |
| `dev`, `build`, `start` | Next.js, behind the environment guard |
| `dev:real` | The dev server with the chat on the real model, from this machine's token in `.env.development.local` |
| `measure`, `measure:fake` | The measurement: fixed requests on the real model and the real search, with that token; the same on the fakes, free (`src/server/AGENTS.md`, *The measurement*) |
| `doctor` | Checks Node, Git, Docker, the pinned Supabase CLI, gitleaks and the GitHub CLI |
| `env:local` | Writes `.env.local` from the running local stack |
| `db:start`, `db:stop` | Starts the local stack and loads the notes; stops it |
| `db:reset` | Rebuilds the local database from the migrations and reloads the notes (deletes local data) |
| `db:migration -- <name>`, `db:types` | Generates a migration from `supabase/schemas/`; regenerates the types |
| `notes:load` | Loads `notes/` into the local database with the fake embedder |
| `lint`, `typecheck`, `format`, `format:check` | ESLint, TypeScript, Prettier |
| `test:unit`, `test:integration`, `test:sql`, `test:e2e` | The four test layers (`tests/AGENTS.md`) |
| `verify` | Format check, lint, typecheck, unit tests and a production build |
| `verify:db` | Reset, schema lint, migration and type drift, SQL tests and integration tests |
| `verify:secrets` | gitleaks over the full Git history |

## Where things live

| What | Where |
| --- | --- |
| Stage, current state, slices | `docs/plan.md` |
| Product documents | `docs/product/` |
| Owner decisions | `docs/decisions.md` |
| Open problems | `KNOWN-ISSUES.md` |
| Stage instructions, modules, planning prompts | `.kit/` |

Documents describe the current state; Git holds the history. Don't create other documents. Evidence and reports go to `docs/records/`, which nobody reads by default. Lasting lessons go into the `AGENTS.md` of the folder they concern, not into agent memory.

## Reporting
Say what changed, which checks ran and their results, and what's unverified. Say where the evidence came from: local, CI or hosted.
