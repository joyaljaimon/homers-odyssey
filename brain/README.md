# Brain — Role 2

Run from the repository root:

```sh
npm install
npm run dev:brain
```

Copy the root `.env.example` to `.env` and fill in `GEMINI_API_KEY` to enable
Gemini. Never commit the key. Without a key, text uses the original canned reply
and voice keeps the original silent socket stub for integration.

Text uses `gemini-flash-latest`. Live voice uses `gemini-3.8-live`, selected
from Google's [Live guide](https://aistudio.google.com/docs/live-api/capabilities)
on November 14, 2026. Live access and voice quality still need a credentialed
smoke test. These are separate text and voice session memories.

## Interfaces

- `POST :8080/text`: the shared `TextRequest` / `TextReply` shapes.
- `WS :8080/voice?sessionId=...`: raw little-endian PCM16 mono, 16 kHz input,
  24 kHz output. Binary audio only from Channel. Brain sends text JSON controls
  `{"type":"interrupted"}` and `{"type":"ended"}`. Channel must clear its
  playback queue on interruption and play binary audio as it arrives.
- `WS :8080/stage?sessionId=...`: shared stage events. Audio and mouth events
  are paced in 50 ms frames; mouth returns to zero on interruption or completion.
- `POST :8080/debug/emit?sessionId=...`: manually publish a stage event.
- `GET :8080/health`: returns `ok` (process liveness, not Gemini readiness).

A call starts as Athena and prompts an AI disclosure. One voice connection per
session id; a duplicate is rejected. Up to two seconds of user audio can wait for
Gemini setup (15-second timeout); output queues are capped at ten seconds.
Errors close the call and release timers/upstream sockets. Channel should wait
for socket closure and reconnect with a new call; automatic upstream resumption
is not implemented. Outgoing `ended` means the call has finished, not a turn.
Brain ends a tool-terminated call only after the final generated audio drains.

## Voices and handoffs

Provisional assignments: Athena `Kore`, Odysseus `Charon`, Poseidon `Fenrir`,
Circe `Aoede`. Only Athena is enabled for voice in this checkpoint. Role 3 owns
character data and should record approved assignments in its `voice` fields.

The 30 prebuilt voices listed in Google's
[voice catalog](https://aistudio.google.com/docs/speech-generation#prebuilt-voices)
are Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Callirrhoe, Autonoe,
Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalgethi,
Laomedeia, Achernar, Alnilam, Schedar, Gacrux, Pulcherrima, Achird,
Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, and Sulafat.

Waiting on:

- Role 1: actual Chert audio formats and playback/interrupt behavior.
- Role 3: full characters, episodes, retrieval, and the 30-problem mapping table.
- Role 4: confirmed scene/map assets and summary-card data delivery design.

Scene tools require an existing scene PNG. Map display and summary-card
attachments await handoffs. Character switching and debate voice sessions follow
in another checkpoint. The prompt requests exact retrieved quotes and citations;
output quote correctness still requires evaluation against Story's full data.

## Verification and rollback

```sh
npm run typecheck
npm exec -w brain -- tsx --test tests/*.test.ts
```

Tests use fake Gemini sessions and a manual playback clock; they incur no API
charges. See [CHANGELOG.md](./CHANGELOG.md) for checkpoints and rollback steps.
