# PRD Assistant

PRD Assistant is a web app being built to turn research notes into a product requirements document (PRD) in which every statement cites the passage it comes from, with each citation checked by the app's own code.

## Status

- **Planning:** done. The [product description](docs/product/prd.md) and the [scope](docs/product/mvp.md) are approved.
- **Build:** in progress. The first feature works end to end. Six fictional interviews are split into passages, embedded and stored in Postgres, then listed on a transcripts page. The drafting assistant isn't built yet.
- **Demo:** none yet.

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
| AI provider | Fake (a word-overlap embedder) | Mistral, staging key, no billing attached | Mistral, production key from launch, no billing attached |
| App | `npm run dev` | Vercel project `prd-assistant-staging`, private | Vercel project `prd-assistant`, public |
| Who changes it | You, locally | GitHub Actions, after every merge to `main` | GitHub Actions, only when the owner starts it |

Hosted keys never sit on a development machine. Search engines index nothing: every address sends `noindex` until a production domain is set at launch.

## Secrets and settings

| Name | Where | What |
| --- | --- | --- |
| `SUPABASE_DB_URL` | GitHub environment secret | The database's session pooler address, with its password |
| `SUPABASE_SECRET_KEY` | GitHub environment secret | `sb_secret_…`, for loading the notes |
| `MISTRAL_API_KEY` | GitHub environment secret, and Vercel (Secret) | The Mistral key for that environment |
| `VERCEL_TOKEN` | GitHub environment secret | A Vercel token for that environment's project only |
| `SUPABASE_URL` | GitHub environment variable, and Vercel (Config) | `https://<ref>.supabase.co` |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub environment variables | The Vercel Team ID and Project ID |
| `SUPABASE_PUBLISHABLE_KEY` | Vercel (Config) | `sb_publishable_…`, the app's read key |
| `AI_PROVIDER` | Vercel (Config) | `mistral` |

GitHub environments are named `staging` and `production`. Vercel values go in each project's **Production** environment only.

## Setting up staging and production

For the owner, or anyone deploying their own copy. Follow the steps in order. Nothing goes online before step 6.

### 1. Mistral, for the AI

1. Sign in at https://admin.mistral.ai.
2. Under **Admin Panel → API → Limits**, check the free limits, check that `mistral-small-2603` and `mistral-embed-2312` are listed, and check that the training setting is off.
3. Create a Workspace for staging.
4. In **Admin Panel → API → API Keys**, select **Create new key**:
   - Pick the staging Workspace.
   - Set an expiry date.
   - Select **Create new key**.
   - Copy the key right away, because it's shown only once. This is the staging `MISTRAL_API_KEY`.
5. The production Workspace and key come at launch.

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
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `AI_PROVIDER` = `mistral`, as **Config**.
   - `MISTRAL_API_KEY`, as **Secret**. The production project gets this one at launch.
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
2. Under **Environment secrets**, add `SUPABASE_DB_URL`, `SUPABASE_SECRET_KEY`, `MISTRAL_API_KEY` and `VERCEL_TOKEN`. Leave out the production `MISTRAL_API_KEY` until launch.
3. Under **Environment variables**, add `SUPABASE_URL`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.

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
| `src/app/` | Pages and routes |
| `src/features/` | Feature UI, such as the transcripts list |
| `src/components/ui/` | Shared UI components |
| `src/server/` | Business operations: the notes loader, the AI providers and the settings checks |
| `src/server/db/` | The data layer: database clients, queries and generated types |
| `src/lib/` | Shared helpers: site facts, the environment guard, shared types |
| `scripts/` | The Node helper commands behind the npm scripts |
| `notes/` | The six fictional interviews |
| `supabase/` | Schema, migrations, SQL tests and local configuration |
| `tests/` | Unit, integration and end-to-end tests |
| `.github/workflows/` | CI, staging and production |
| `docs/` | The plan, product documents and decisions |

Built with my [AI App Starter](https://github.com/TechNomadCode/AI-Product-Development-Toolkit/tree/main/starters/nextjs-supabase-vercel).
