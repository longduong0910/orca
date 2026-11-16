@AGENTS.md

# Branch Rule

- Code every feature/fix directly on `ship/game-personalization`. Don't create feature branches.
- If not currently on it, switch to `ship/game-personalization` before editing.

# Sync Upstream & Build the Local App (macOS)

Remotes: `origin` = fork `longduong0910/orca`, `upstream` = `stablyai/orca`. Fork `main` mirrors upstream.

When the user says "sync upstream" (or "update"), run steps 1–4 in order; that request counts as approval for the push in step 3. Stop and report if any step fails.

1. Sync fork main (fast-forward only): `git fetch upstream main origin && git push origin upstream/main:refs/heads/main`. If it isn't a fast-forward, stop and ask.
2. Rebase `ship/game-personalization` onto it: `git pull --rebase --autostash origin main`. Resolve conflicts (both sides adding keys at the end of a locale JSON → keep both), then `pnpm tc`.
3. Push: `git push --force-with-lease origin ship/game-personalization`.
4. Build + install: `./update-local.sh` — run it in the background, it takes several minutes.
   - Needs nvm with Node 24. Signs with keychain identity `Orca Local` (override: `ORCA_LOCAL_MAC_SIGN_IDENTITY`); falls back to ad-hoc if missing.
   - After the build it quits Orca, backs up `~/Library/Application Support/orca` to `~/orca-backup`, replaces `/Applications/Orca.app` and reopens it. This kills agents running inside Orca terminals — warn the user first.
   - Logs: build output on stdout; install step in `~/Library/Logs/orca-update-local.log` (last line `installed <version>` = success).

Build only (no sync): run step 4 alone.
