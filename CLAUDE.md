@AGENTS.md

## Claude Code only
- **Desktop app:** `.claude/launch.json` runs the app for the Browser pane: `app` with the fakes, `app-real` with the chat on the real model, which spends neurons (`AGENTS.md`, Boundaries). After a UI change, check the page there once with `app` before you finish.
- **Worktree sessions** (desktop worktree option or `claude --worktree`): run `npm ci` first. `.worktreeinclude` copies `.env.local` in for you, not `.env.development.local`, so `npm run dev:real` works in the main checkout only, unless the owner copies that file in by hand.
