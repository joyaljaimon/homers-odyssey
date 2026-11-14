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

## Checkpoint 2 — Athena text conversation and tools

- Added the Gemini SDK text/tool loop using shared declarations, preserving full
  model parts and function-call ids. Default model: `gemini-flash-latest`;
  optionally set `GEMINI_TEXT_MODEL` in the local environment to pin a model.
- Added Athena's prompt, Story retrieval, passage validation, character handoff
  validation, scene attachments, and takeaway/session termination.
- In-memory sessions expire after 30 minutes of inactivity, are capped at 200,
  and trim history at complete user-turn boundaries. Messages within one session
  run sequentially. Model failures do not commit partial history or stage events.
- No API key preserves the original stub so Channel and Experience can integrate.
  Configured API failures propagate rather than pretending a stub is a real answer.
- Offline tests: `npm exec -w brain -- tsx --test tests/text.test.ts`.
- SDK reference: https://googleapis.github.io/js-genai/ (generateContent and manual
  function responses). No shared contracts or other roles' source files changed.
- Limitations: no credentialed Gemini call verified yet; voice remains a stub.
  Map events await Role 4's asset allowlist. Scene display requires a committed
  `assets/scenes/<id>.png`. Summary-card attachment awaits a data handoff contract;
  end_session currently returns the takeaway as text without a card attachment.
  Story currently supplies only Athena, so other characters are rejected.
- Handoff to Roles 1 and 4: text/stage interfaces are unchanged; no-key behavior
  remains the stub. Gemini text is enabled by `GEMINI_API_KEY`.
- Verification result: workspace typecheck passed; all 7 offline tests passed.
  Dependencies installed successfully with no tracked lockfile change.
