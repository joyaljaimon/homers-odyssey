# Brain implementation log

Every major Brain change gets a separate commit and an entry here describing behavior,
setup, verification, and limitations. Keep secrets in the root `.env`.

## Checkpoint 1 — implementation baseline

- Branch: `role/brain`; clean starting commit: `863bc8f`.
- Existing text replies and voice handling are stubs. Stage event fan-out exists.
- First implementation: Athena text conversations, per-session memory, validated tool
  execution, and a no-key stub fallback. Voice integration follows separately.
- Setup: run `npm install` at the repository root, copy `.env.example` to `.env`,
  and set `GEMINI_API_KEY` to enable Gemini. Run `npm run dev:brain`.
- Verification: run `npm run typecheck` plus Brain's offline conversation/tool tests.
- Rollback: use `git log --oneline role/brain` to find checkpoints. To undo a specific
  implementation commit without discarding history, run `git revert <commit>` on
  a clean working tree. Revert dependent commits newest first. The baseline remains
  available at `863bc8f`; do not reset or discard unrelated work.
