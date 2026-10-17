# PRD Assistant

PRD Assistant is a web app being built to turn research notes into a product requirements document (PRD) in which every statement cites the passage it comes from, with each citation checked by the app's own code.

## Status

- **Planning:** done. The [product description](docs/product/prd.md) and the [scope](docs/product/mvp.md) are approved.
- **Build:** in progress. Six fictional interviews are split into passages, embedded and stored in Postgres, and listed on a transcripts page. On the home page, a streaming chat drafts the PRD with you, section by section, from the interviews: the model decides when to search them, and each search shows as a line that opens to its passages. The model saves each section it drafts, and the app's own code checks every quote before you see it. The PRD beside the chat comes next.
- **Demo:** none yet.

## How it works

### Searching the interviews

Before the assistant writes anything, it searches the interviews and works from the passages it finds, not from what the model happens to know. This is retrieval-augmented generation (RAG). The search, built ahead of the assistant, has three parts.

1. **Chunking by question and answer.** The notes loader cuts each interview into passages of one researcher question and the interviewee's whole answer ([`parse-interview.ts`](src/server/notes/parse-interview.ts)). A passage never mixes two people or two questions, so a citation points at one person's words, and a quote is checked against that answer alone. The question stays attached because answers lean on it: "Every single item, yes" means little without "How would you want to know when Ineke adds something?"
2. **Embeddings.** `bge-large-en-v1.5`, run by Cloudflare Workers AI, turns each passage's question and answer into 1,024 numbers, stored beside the text in Postgres with pgvector ([`transcripts.sql`](supabase/schemas/transcripts.sql)). Texts with similar meanings get vectors that point in similar directions. The loader embeds only new or changed passages. The model's name is part of each passage's hash, so a new model re-embeds everything instead of mixing two models' vectors. The model reads at most 512 tokens of a text, and Cloudflare doesn't say what happens to the rest, so the loader refuses any passage that might be longer and names it, rather than let the model embed only its start ([`embedding-input.ts`](src/server/ai/embedding-input.ts)). It needs no tokenizer for that: the model's tokenizer never makes more tokens than a text has non-space characters, plus two, so 510 such characters always fit. The longest passage today has about 300.
3. **The similarity search.** A question is embedded with the same model. Then one SQL function, [`search_passages`](supabase/schemas/search.sql), ranks every passage by cosine distance to it and returns the five closest, each with the interviewee's name and the researcher's question ([`search.ts`](src/server/search.ts)). With tens of passages, comparing them all is exact and faster than an index; an approximate index (HNSW) pays off at thousands.

The search refuses an empty question or one over 500 characters. Before anything reaches the database, it checks that the vector has exactly 1,024 numbers and isn't all zeros. The app's read key may read the passages but not the vectors, so `search_passages` runs with its owner's rights, and only the read key may call it. It returns the passage text that key can read anyway, plus each distance. Because the distances come from the vectors, a caller who sent enough probe vectors could work the vectors out. That's harmless here: they embed public text, which anyone can embed again with the same model.

Locally and in CI, a fake embedder stands in for Cloudflare. It counts shared words, so the tests are free and always give the same result, but it knows no synonyms: to it, "ping" and "notification" are unrelated. Search by meaning runs only on staging and production.

### The chat

The chat runs on the [Vercel AI SDK](https://ai-sdk.dev). The browser's `useChat` posts the conversation to [`/api/chat`](src/app/api/chat/route.ts), and the server streams the answer back ([`chat.ts`](src/server/chat.ts)). Each model reply arrives whole, though: streamed, Cloudflare sends gpt-oss's search requests as reasoning text without the tool's name, so the app asks for whole replies and passes each one on as a single piece ([`cloudflare.ts`](src/server/ai/cloudflare.ts)). The search line still appears before the answer.

1. **Tool calling.** `streamText` runs OpenAI's open-weight `gpt-oss-20b` on Cloudflare Workers AI, through its OpenAI-compatible endpoint, with two tools: `searchNotes`, and `saveSection` for the citation check below. The model decides when to search and what for; the app's code runs the search above and hands back the five closest passages. The model sees each passage's interviewee, question and answer. The browser gets the same passages to show, and each search appears as one line, such as "closest passages from Maya, Henk and Daan", that opens to them. After three searches the app stops offering the search, so the model has to save or write: asked for a section, gpt-oss kept searching until it ran out of model calls. Once the section is saved, it offers no tools at all, so the model replies, and the last call of an answer never carries tools. Each call may write up to 4,096 tokens, reasoning included; Cloudflare's default of 256 cut drafts off.
2. **Failures stay visible.** Whatever breaks, the provider before its first word, the provider partway through, or the connection, the stream ends with a plain error, and the cause is logged on the server. So does an answer the model ends without writing anything, or one cut off at its output limit. An answer that broke off stays on screen marked as unfinished. "Try again" asks again, and the unfinished answer never goes back to the model as if it were whole.
3. **Token awareness.** The server logs the tokens every answer used, summed over its model calls, including answers that broke off. The model reasons before it answers; that reasoning stays on the server and never goes back to the model with later messages. Searches from earlier answers go back to the model as passage ids and interviewees only, so a long conversation doesn't send every passage it ever found with each new message; to quote one again, the model searches again.
4. **The instructions.** The system prompt is the PRD prompt from my [AI Product Development Toolkit](https://github.com/TechNomadCode/AI-Product-Development-Toolkit), adapted and versioned in [`system-prompt.ts`](src/server/prompts/system-prompt.ts). It keeps the template's role, its check-in before each new section and its nine sections. Where the template asks questions before writing anything, the assistant drafts first from the interviews and asks only what they don't say. On top come the traceability rules of the toolkit's research prompt (every statement traces to a passage or to your own message, interpretations are marked as such, unsupported assumptions become open questions), saving each section for the check, the citation format, how to show a contradiction, and a rule never to invent. Every model call sends the whole prompt, about 1,775 tokens. Any change to the text needs a new version: a test compares the text's fingerprint with the one recorded for its version.

Locally and in CI, a scripted fake model stands in for Cloudflare ([`fake-chat-model.ts`](src/server/ai/fake-chat-model.ts)). It searches with the visitor's own words, then quotes the closest passage. Asked for a section, it saves one that quotes the passages it found instead, so the check runs against the real passages in the local database. Phrases in a message make it fail on purpose, once each, or save a flawed section, so the tests can show the error, the retry and the check catching bad quotes.

### The citation check

The model never decides whether a quote is real. It saves each section with `saveSection`, as a list of statements, each with its citations: a passage id such as `henk-4`, or `chat` for your own words, and a short quote. The app's code checks every quote before you see the section ([`citations.ts`](src/server/citations.ts)):

1. **Against the right words.** An interview quote is checked against the answer of the passage it cites, read from the database with the app's read key. The researcher's question never counts, and neither does another answer, even one by the same person. A quote of your words is checked against the messages you sent in this chat, never the assistant's.
2. **The matching rule.** A quote passes when it has the same words in the same order as its source, ignoring letter case, spacing, the style of quote marks and punctuation at its ends. It must match whole words: "ink" isn't in "drink". Nothing else is forgiven: a changed word, a dropped comma or a gap in the middle fails.
3. **Nothing hidden.** A quote that fails is shown as unverified, with the reason, and a statement that cites nothing is flagged, except in Open Questions / Future Considerations, where a question needs no source. Each quote sits next to its statement and shows its source by name, such as "Daan, interview" or "You, in this chat", and the check's result.
4. **The model hears the result.** It gets the counts, every unverified quote and every statement that cites nothing, so its reply can say so and offer a fix. A section the check can't read, such as one with an unknown section name, isn't saved, and the model gets one more try.

What the check proves, and what it doesn't: it proves that the quoted words exist and belong to that person. It doesn't prove that the statement reads them fairly. Henk says "Black on white or white on black, I don't mind"; a statement that Henk asked for a dark mode would pass the check with that quote. That's why every quote sits right next to its statement, where you can judge the reading yourself, and why the planned quality check tests the dark mode claim on its own.

## Quick start

You need Node.js 24 (see `.nvmrc`), Docker Desktop running, Git and the [gitleaks](https://github.com/gitleaks/gitleaks#installing) secret scanner. `npm run doctor` checks them all.

```bash
npm ci
npm run db:start
npm run env:local
npm run dev
```

Then open http://localhost:3000. Everything runs on your machine: the database in Docker and a fake AI provider, with no accounts or keys. The local database dashboard (Supabase Studio) is at http://127.0.0.1:57323. Before your first end-to-end test run, install the test browser with `npx playwright install chromium`.

## Daily commands

| Command | What it does |
| --- | --- |
| `npm run dev` | The app in development mode, at http://localhost:3000 |
| `npm run build`, `npm start` | A production build, and serving it |
| `npm run doctor` | Checks Node, Git, Docker, the pinned Supabase CLI, gitleaks and the GitHub CLI |
| `npm run env:local` | Writes `.env.local` from the running local database |
| `npm run db:start`, `npm run db:stop` | Starts the local database and loads the sample notes; stops it |
| `npm run db:reset` | Rebuilds the local database from the migrations and reloads the notes (deletes local data) |
| `npm run db:migration -- <name>` | Generates a migration from the schema files |
| `npm run db:types` | Regenerates the database types |
| `npm run notes:load` | Loads `notes/` into the local database |
| `npm run test:unit`, `test:integration`, `test:sql`, `test:e2e` | The four test layers |
| `npm run verify` | Format check, lint, type check, unit tests and a production build |
| `npm run verify:db` | Database reset, schema lint, migration and type drift, SQL tests and integration tests |
| `npm run verify:secrets` | Scans the whole Git history for secrets |
| `npm run lint`, `typecheck`, `format`, `format:check` | The individual code checks |

Every dev, build, test and database command first runs an environment guard. It stops if anything points at a hosted database or API, picks a real AI provider, or holds a real provider key.

## Changing the database

The files in `supabase/schemas/` are the single source of truth for the database.

1. Edit the schema files.
2. Run `npm run db:migration -- <name>` to generate `supabase/migrations/<timestamp>_<name>.sql`, and review it.
3. Run `npm run db:reset` to apply every migration to a fresh local database. It reloads the notes.
4. Run `npm run db:types` to regenerate `src/server/db/database.types.ts`.
5. Add or update the SQL tests in `supabase/tests/`, then run `npm run verify:db`.
6. Commit the schema, the migration and the types together.

Every table and function starts closed to the public API and opens only through explicit grants. `supabase/AGENTS.md` has the rules.

## Environments

| | Local | Staging | Production |
| --- | --- | --- | --- |
| Database | Supabase in Docker on your machine | Supabase project `prd-assistant-staging`, Frankfurt | Supabase project `prd-assistant-production`, Frankfurt |
| AI provider | Fakes (a word-overlap embedder and a scripted chat model) | Cloudflare Workers AI, free plan, staging token | Cloudflare Workers AI, free plan, production token from launch |
| App | `npm run dev` | Vercel project `prd-assistant-staging`, private | Vercel project `prd-assistant`, public |
| Who changes it | You, locally | GitHub Actions, after every merge to `main` | GitHub Actions, only when the owner starts it |

Hosted keys never sit on a development machine. Search engines index nothing: every address sends `noindex` until a production domain is set at launch.

## Secrets and settings

| Name | Where | What |
| --- | --- | --- |
| `SUPABASE_DB_URL` | GitHub environment secret | The database's session pooler address, with its password |
| `SUPABASE_SECRET_KEY` | GitHub environment secret | `sb_secret_…`, for loading the notes |
| `CLOUDFLARE_API_TOKEN` | GitHub environment secret, and Vercel (Secret) | The Workers AI token for that environment |
| `VERCEL_TOKEN` | GitHub environment secret | A Vercel token for that environment's project only |
| `SUPABASE_URL` | GitHub environment variable, and Vercel (Config) | `https://<ref>.supabase.co` |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub environment variable, and Vercel (Config) | The Cloudflare account ID, 32 characters |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub environment variables | The Vercel Team ID and Project ID |
| `SUPABASE_PUBLISHABLE_KEY` | Vercel (Config) | `sb_publishable_…`, the app's read key |
| `AI_PROVIDER` | Vercel (Config) | `cloudflare` |

GitHub environments are named `staging` and `production`. Vercel values go in each project's **Production** environment only.

## Setting up staging and production

For the owner, or anyone deploying their own copy. Follow the steps in order. Nothing goes online before step 6.

### 1. Cloudflare, for the AI

The app runs on the Workers Free plan: 10,000 neurons a day at no charge, reset at 00:00 UTC. At the limit, requests fail with error 429 and nothing is charged (https://developers.cloudflare.com/workers-ai/platform/pricing/). Staging and production share that daily allocation.

1. Sign in at https://dash.cloudflare.com. New accounts are on the Workers Free plan by default; don't add a card or upgrade, so running out fails instead of charging.
2. Go to **AI → Workers AI** and select **Use REST API** (https://developers.cloudflare.com/workers-ai/get-started/rest-api/).
3. Select **Create a Workers AI API Token**, check that it grants Workers AI Read and Edit on this account only, then select **Create API Token** and copy it. This is the staging `CLOUDFLARE_API_TOKEN`.
4. On the same page, copy the **Account ID**. This is `CLOUDFLARE_ACCOUNT_ID`, the same for both environments.
5. The production token comes at launch.

### 2. Supabase, two projects

Do this twice: first for `prd-assistant-staging`, then for `prd-assistant-production`.

1. At https://supabase.com/dashboard, select **New project**:
   - Plan: Free.
   - Region: **Central EU (Frankfurt)**.
   - Database password: letters and digits only, saved in your password manager.
2. The project's Postgres version must be 17, matching `supabase/config.toml`.
3. Click **Connect** at the top of the page and choose **Session pooler**. Copy the address and put your password where it says `[YOUR-PASSWORD]`. This is `SUPABASE_DB_URL`.
4. From the same **Connect** dialog, copy the project URL (`SUPABASE_URL`) and the publishable key (`SUPABASE_PUBLISHABLE_KEY`).
5. Under **Settings → API Keys**, on the **Publishable and secret API keys** tab, copy the secret key named `default` (`SUPABASE_SECRET_KEY`). Every new project starts with one (https://supabase.com/docs/guides/getting-started/api-keys).

### 3. Vercel, two projects

First for `prd-assistant-staging`, then for `prd-assistant`.

1. At https://vercel.com, select **Add New… → Project** and import `TechNomadCode/prd-assistant`. Name it `prd-assistant-staging` and deploy.
   - The first build may fail, because the variables aren't there yet. That's expected: from step 2 on, only GitHub Actions deploys.
2. Open **Settings → Git** and select **Disconnect**. From now on, only GitHub Actions deploys.
3. Under **Settings → Environment Variables**, add these to the **Production** environment only, leaving Preview and Development empty:
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CLOUDFLARE_ACCOUNT_ID` and `AI_PROVIDER` = `cloudflare`, as **Config**.
   - `CLOUDFLARE_API_TOKEN`, as **Secret**. The production project gets this one at launch.
4. For staging only, under **Settings → Deployment Protection**, turn on **Vercel Authentication** and choose **All Deployments**, not Standard Protection, which leaves the main address public. All Deployments is available on every plan (https://vercel.com/docs/security/deployment-protection). Then only you can open staging, and strangers can't use up the free AI quota.
5. Note the **Project ID** from **Settings → General**, and the **Team ID** from your team's **Settings → General**.
6. Switch the scope selector at the top left to your personal account, then on https://vercel.com/account/tokens create a token (https://vercel.com/docs/accounts/access-tokens):
   - Under **Scope**, choose your team and then this one project.
   - Set an expiry date.
   - Copy the token. This is that environment's `VERCEL_TOKEN`.

A changed Vercel setting takes effect only at the next deploy. Re-run the latest **Deploy staging** workflow to apply it.

### 4. GitHub, environments and secrets

In the repository, open **Settings → Environments → New environment**. Create `staging`, then `production`, and set each one up:

1. Under **Deployment branches and tags**, choose **Selected branches and tags** and add `main`.
2. Under **Environment secrets**, add `SUPABASE_DB_URL`, `SUPABASE_SECRET_KEY`, `CLOUDFLARE_API_TOKEN` and `VERCEL_TOKEN`. Leave out the production `CLOUDFLARE_API_TOKEN` until launch.
3. Under **Environment variables**, add `SUPABASE_URL`, `CLOUDFLARE_ACCOUNT_ID`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.

Create the environments before the workflows reach `main`. Otherwise GitHub creates them empty, without the branch rule.

### 5. Push and open a pull request

```bash
git push -u origin feat/walking-skeleton
```

On GitHub, open a pull request into `main` and wait for the five checks: `verify`, `verify:db`, `test:e2e`, `dependency audit` and `verify:secrets`.

Optional: once they've run, add a ruleset under **Settings → Rules → Rulesets**. Have it require a pull request and these five checks before anything merges into `main`.

### 6. Merge and watch staging

Merge the pull request, then open **Actions → Deploy staging**. The jobs run in order:
1. CI.
2. Migrate the staging database.
3. Load the notes into staging.
4. Deploy the code to staging.

The last job shows the staging address. If a step fails, the steps after it don't run.

### Production, at launch

Open **Actions → Deploy production → Run workflow** on `main`. You can enter a commit, but it must already have reached staging. The workflow migrates the production database, loads the notes, then deploys the code.

## Where the code lives

| Folder | What's there |
| --- | --- |
| `src/app/` | Pages and routes, such as the chat's endpoint |
| `src/features/` | Feature UI, such as the chat and the transcripts list |
| `src/components/ui/` | Shared UI components |
| `src/server/` | Business operations: the chat and its system prompt, the citation check, the notes loader, the interview search, the AI providers and the settings checks |
| `src/server/db/` | The data layer: database clients, queries and generated types |
| `src/lib/` | Shared helpers: site facts, the environment guard, shared types |
| `scripts/` | The Node helper commands behind the npm scripts |
| `notes/` | The six fictional interviews |
| `supabase/` | Schema, migrations, SQL tests and local configuration |
| `tests/` | Unit, integration and end-to-end tests |
| `.github/workflows/` | CI, staging and production |
| `docs/` | The plan, product documents and decisions |

Built with my [AI App Starter](https://github.com/TechNomadCode/AI-Product-Development-Toolkit/tree/main/starters/nextjs-supabase-vercel).
