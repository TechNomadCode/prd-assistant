# Workflows: rules for working here

Ask the owner before changing anything in this folder (root `AGENTS.md`, Boundaries). Never run a workflow, set a secret or call a hosted CLI yourself.

## What runs when
| Workflow | Trigger | Jobs, each waiting for the one before |
| --- | --- | --- |
| `ci.yml` | every pull request; called by staging | `verify`, `verify:db`, `test:e2e`, dependency audit, `verify:secrets` (in parallel, local stack and fakes only) |
| `deploy-staging.yml` | every push to `main` | CI → migrate → load notes → deploy |
| `deploy-production.yml` | the owner, by hand, on `main` | check the commit reached staging → migrate → load notes → deploy |

## How the pipeline rules are met
1. **Staging follows `main`:** `deploy-staging.yml` runs on push to `main`. It chains its jobs with `needs:` in one workflow rather than using `workflow_run`. `workflow_run` deploys the newest commit on `main` rather than the commit CI tested, and it fires even when CI failed.
2. **Production only when the owner starts it, from a commit that passed CI:**
   - `workflow_dispatch` with an optional `sha`.
   - The `verify` job (`actions: read`) requires a successful push run of `deploy-staging.yml` on `main` for that exact SHA. That run includes CI.
   - The `production` environment only allows `main`.
3. **No code before its migrations:**
   - Migrate → load notes → deploy, joined by `needs:`. A failed or skipped job stops every job after it.
   - Vercel never deploys on its own: the repository stays unconnected, and `vercel.json` sets `git.deploymentEnabled: false` as a guard.
   - `cancel-in-progress: false`, so a run is never cut off between migrate and deploy.
4. **Test keys on staging, no live keys in production before launch:**
   - Mistral has no test mode, so staging uses its own key with no billing attached (`docs/decisions.md`).
   - Production gets no `MISTRAL_API_KEY` until launch. Its migrate job checks for the key first and stops with a clear error before touching the database, so production can't be deployed before then.
5. **Each workflow gets only its own environment's credentials:**
   - Secrets live in the GitHub environments `staging` and `production`, never at repository level.
   - Supabase: a connection string for that one database (`--db-url`), so no account token is needed.
   - Vercel: a token scoped to that environment's own Vercel project. Staging and production are two separate projects.
6. **Nothing copies hosted credentials to a development machine:**
   - Vercel builds the code itself (`vercel deploy --prod`, without `--prebuilt` or `vercel pull`).
   - With `--non-interactive`, `vercel deploy` prints JSON (`status`, `deployment.url`, `deployment.productionUrl`), not the bare address the deploy docs describe; the workflows read the address with `jq`. Checked in the `vercel@64.5.0` package source (`getDeploymentOutputJson`); see also https://vercel.com/docs/cli/global-options.
   - Never use `vercel login/link/pull/env pull/env run/dev`, `supabase login/link` or `supabase projects api-keys` here. `.claude/settings.json` and `.codex/rules/default.rules` block them.
7. **Only the production domain can be indexed:**
   - Vercel sends `noindex` only on preview and outdated deployments, so the app sends `X-Robots-Tag: noindex` itself (`next.config.ts`).
   - That covers every host except `SITE_INDEXABLE_HOST`, which stays unset until launch. The e2e tests check the header.

## Secrets and variables
For each GitHub environment, `staging` and `production` (deployment branches: `main` only):
- **Secrets:**
  - `SUPABASE_DB_URL`: the session pooler URI, with a percent-encoded password.
  - `SUPABASE_SECRET_KEY`: `sb_secret_…`
  - `MISTRAL_API_KEY`: the production one only at launch.
  - `VERCEL_TOKEN`: scoped to that Vercel project.
- **Variables:** `SUPABASE_URL`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

Vercel project settings (Production environment only, credentials as type Secret): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AI_PROVIDER=mistral`, `MISTRAL_API_KEY`. `README.md` has the owner's steps, click by click.

## Gotchas
- **Migrations must not break the running code.** The old code keeps running between migrate and deploy, after a failed deploy, and after a rollback. Add before you remove: a new column first, dropping the old one in a later change.
- **Use the session pooler.** Hosted Supabase databases on the Free plan are reached directly only over IPv6, and GitHub runners are IPv4. Use the session pooler string (port 5432, user `postgres.<ref>`) from the dashboard's Connect dialog, with the password percent-encoded. Store the whole URL as one secret so GitHub masks it.
- **Staging can skip commits.** A waiting staging run is replaced by a newer one, and production accepts only commits with a successful staging run.
- **Supabase Free pauses idle projects** after about 7 days. Staging runs then fail until the owner restores the project in the dashboard.
- **Pinned tools.** Actions are pinned to full commit SHAs, with the version in a comment: update both together. The Vercel CLI (`vercel@64.5.0`) and gitleaks (version and SHA-256) are pinned in the YAML too.
- **Vercel runs Node 22 or 24 only.** `package.json` `engines` and `.nvmrc` pin 24, and Vercel and `setup-node` read them.

## Sources (read 2026-10-17)
- Vercel:
  - Deploying with GitHub Actions: https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel
  - CLI global options, `VERCEL_TOKEN` and `--non-interactive`: https://vercel.com/docs/cli/global-options
  - Deploy output: https://vercel.com/docs/cli/deploy
  - `git.deploymentEnabled`: https://vercel.com/docs/project-configuration/git-configuration
  - Access tokens: https://vercel.com/docs/accounts/access-tokens
  - Indexing of previews: https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines
  - Node versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
  - Regions: https://vercel.com/docs/regions
- Supabase:
  - `db push --db-url`: https://supabase.com/docs/reference/cli/supabase-db-push
  - Connection strings and IPv4: https://supabase.com/docs/guides/database/connecting-to-postgres
  - API keys: https://supabase.com/docs/guides/api/api-keys
- GitHub:
  - Environments and `deployment: false`: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
  - Deployment branches: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
  - `gh run list`: https://cli.github.com/manual/gh_run_list
