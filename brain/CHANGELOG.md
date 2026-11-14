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

## Checkpoint 3 — Athena Live audio bridge

- Implemented a Gemini Live connection per call, waiting for `setupComplete`
  before greeting or forwarding buffered user PCM. Uses `gemini-3.8-live` with
  provisional Athena voice `Kore`, selected from Google's docs on 2026-11-14.
- Shared text/voice declarations and prompt loading now live in `src/config.ts`.
- Added 50 ms PCM playback pacing and mouth levels on the same clock. Every audio
  part is processed; interruptions clear pending playback and send Channel the
  shared interrupted control. Output transcription drives caption events.
- Reused validated retrieval/highlight/scene/end tools in Live. Character handoff
  explicitly reports unavailable in this checkpoint. Final takeaway generation
  has a 35-second deadline; normal termination waits for audio to drain.
- Added bounded audio queues, a setup deadline, duplicate-call rejection, and
  cleanup for disconnects, malformed PCM, slow consumers, and late connections.
  No-key voice retains the original silent stub; no shared interfaces changed.
- Stage fan-out skips closed sockets and removes empty subscriber sets. Mouth
  RMS safely ignores an incomplete trailing sample.
- Setup, protocol, provisional voice catalog/assignments, integration limitations,
  and handoff requests are in [README.md](./README.md).
- Offline tests cover audio formats/pacing, interruption, tool ids, end-session
  playback, errors, duplicate sessions, setup readiness, and queue limits. Real
  Gemini/Chert audio and model access still require credentialed verification.
- Rollback: revert this checkpoint's commit to restore voice stubs while retaining
  the previous text implementation. Earlier checkpoint: `c0434c6`.
- Verification result: workspace typecheck and all 16 offline tests passed.
  No local `.env` exists, so a credentialed Gemini smoke test remains pending.

## Checkpoint 4 — character prompts and Live handoffs

- Prepared separate prompts for all four characters with shared grounding and AI
  disclosure rules. Each prompt includes Role 3's guide at runtime; characters
  absent from Story data remain unavailable rather than receiving invented guides.
- Implemented Live character handoff: acknowledge the tool, clear old playback,
  send interrupted, close the previous session, and connect with the new prompt
  and voice. Incoming audio buffers during new setup under the existing limits.
- Each upstream connection has a generation id so old audio, errors, or close
  callbacks cannot affect the replacement. Known Story voices override Brain's
  provisional voice map; placeholder values use the provisional selection.
- Enabled input transcription for a bounded 4,000-character recent-conversation
  excerpt passed to replacement sessions. This deliberately avoids an extra
  summary-model request on the live handoff path; fuller summaries can follow
  listening/latency evaluation. Excerpts stay in memory and clear on termination.
- Added offline tests for context/voice transfer, stale callback isolation, and
  missing-character rejection. All 18 tests pass; workspace typecheck passes.
- Current handoff dependency: only Athena exists in sample character data. Role 3
  must supply the remaining guides/voices before real multi-character evaluation.
- Rollback: revert this checkpoint to retain the Athena voice bridge from
  `35af81f`; prior text implementation is `c0434c6`.

## Checkpoint 5 — confirmed stage event behavior

- Recorded Role 4's handoff: no `side` selects a solo character; left/right sides
  place the two debate characters; mouth events identify the current speaker so
  Stage can dim the other character. Target rate remains one event per 50 ms.
- Removed synthetic mouth-reset events on silence, interruption, and disconnect.
  Stage closes mouths automatically after 200 ms without mouth events. This also
  prevents an idle/reset event from selecting an old speaker in debate mode.
  Silent PCM frames can still produce a natural level of zero during playback.
- Checked solo greetings and handoffs omit `side`. Voice tests check no terminal
  reset event, no interruption mouth event, and correct speaker identity after a
  handoff. Debate orchestration remains a separate implementation task.
- Rollback: revert this checkpoint to restore explicit mouth resets; previous
  character-handoff checkpoint is `37761c9`.
- Verification result: all 18 offline tests and the workspace typecheck pass.
