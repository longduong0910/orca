@AGENTS.md

# Branch Rule

- Code every feature/fix directly on `ship/game-personalization`. Don't create feature branches.
- If not currently on it, switch to `ship/game-personalization` before editing.

# Sync & Build the Local App (macOS)

Remotes: `origin` = fork `longduong0910/orca`, `upstream` = `stablyai/orca`. Fork `main` mirrors upstream.

1. Sync fork main (fast-forward only): `git fetch upstream main && git push origin upstream/main:refs/heads/main`
2. Rebase work onto it: `git pull --rebase --autostash origin main` (or `./update-local.sh --pull`, which does this then builds). Resolve conflicts, then `pnpm tc`.
3. Build + install: `./update-local.sh` — run it in the background, it takes several minutes.
   - Needs nvm with Node 24. Signs with keychain identity `Orca Local` (override: `ORCA_LOCAL_MAC_SIGN_IDENTITY`); falls back to ad-hoc if missing.
   - After the build it quits Orca, backs up `~/Library/Application Support/orca` to `~/orca-backup`, replaces `/Applications/Orca.app` and reopens it. This kills agents running inside Orca terminals — warn the user first.
   - Logs: build output on stdout; install step in `~/Library/Logs/orca-update-local.log` (last line `installed <version>` = success).
4. Pushing `ship/game-personalization` after a rebase needs `git push --force-with-lease origin ship/game-personalization` — only with the user's OK.
