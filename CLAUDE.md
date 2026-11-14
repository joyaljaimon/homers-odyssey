# Homer's Odyssey — instructions for Claude

A hackathon project built by 4 people, one per role. Users text or FaceTime a phone number and talk to a
character from the Odyssey (Athena, Odysseus, Poseidon, Circe). On calls the agent's video is a web "stage":
a 2D character whose mouth moves with its audio, the Odyssey text with the current passage highlighted, and
scene images or a journey map. The character relates the story to the user's own problem and ends with a
"Your Ithaca" takeaway.

## First thing to do in every session: figure out the user's role

1. If the user says which role they are ("I am role 2", "I'm on Brain"), use that.
2. Otherwise run `git branch --show-current`. `role/channel` = 1, `role/brain` = 2, `role/story` = 3,
   `role/experience` = 4.
3. Otherwise ask: "Which role are you: 1 Channel, 2 Brain, 3 Story, or 4 Experience?"

Then:

- Read the role's playbook: [docs/roles/role-1-channel.md](docs/roles/role-1-channel.md),
  [docs/roles/role-2-brain.md](docs/roles/role-2-brain.md), [docs/roles/role-3-story.md](docs/roles/role-3-story.md)
  or [docs/roles/role-4-experience.md](docs/roles/role-4-experience.md).
- Make sure they are on their branch. If on `main`, run `git checkout role/<name>` (create it from
  `origin/role/<name>` if missing). Never build on `main`.
- Run `git fetch origin && git rebase origin/main` so they start from the latest shared work.
- Look at what's already done in their folder against the playbook's checklist, tell the user where they are
  in the timeline, and propose the next task. Work through the checklist in order unless the user asks otherwise.

## Roles, branches and folders

| Role | Branch | Owns |
| --- | --- | --- |
| 1. Channel — Chert number, iMessage/SMS, FaceTime, streaming the stage as video | `role/channel` | `channel/` |
| 2. Brain — Gemini Live, character personas, tools, problem→episode mapping | `role/brain` | `brain/` |
| 3. Story — Odyssey text, episodes, character guides, retrieval | `role/story` | `story/` |
| 4. Experience — stage page, character art, summary card, demo and pitch | `role/experience` | `stage/`, `assets/`, `demo/` |
| Shared | any | `contracts/`, `.env.example`, `README.md`, `CLAUDE.md`, `docs/` |

## Rules you must follow

- **Only edit files in the user's own folders.** If their task needs a change in someone else's folder, do not
  make it. Instead write a short message the user can send to that role, saying exactly what is needed and why.
- **`contracts/` is shared.** Every role codes against `contracts/types.ts` and `contracts/tools.json`. Before
  changing them, tell the user which roles are affected and draft the team-chat announcement. After the change,
  bump `// contract version: N` at the top of the file. Prefer adding optional fields over changing existing ones.
- **Handoffs.** [docs/handoffs.md](docs/handoffs.md) lists everything one role must tell another. When you finish
  a task that appears there, or learn a fact listed there (for example Chert's audio format), stop and tell the
  user: "Share this with Role N: …" with a ready-to-paste message. Also check whether the user is *waiting* on a
  handoff and suggest building against the stub until it arrives.
- **Stubs first.** Each package already has stubs returning correctly shaped fake data. Keep the stub working
  until the real version works, so other roles are never blocked.
- **Never commit secrets.** Keys live in `.env` (gitignored). New variables go in `.env.example` with no value.
- **Don't invent facts about Chert's API.** Nobody on the team knew its details at the start. Read
  `cherthq/chert-facetime-opensource` or ask the user rather than guessing.
- **Quotes from the Odyssey must come from `story/data/passages.json`** (Samuel Butler's translation), cited as
  `book.paragraph` ids like `12.14`. Never make up quotes.
- The agent must say it is an AI in its first message. Don't store or record video.

## Git workflow (see [docs/git-workflow.md](docs/git-workflow.md))

- Commit messages start with the folder: `brain: add highlight_passage tool`.
- Commit and push often; open small PRs from `role/<name>` into `main`. `main` only accepts pull requests.
- Before pushing: `git fetch origin && git rebase origin/main`, then `npm run typecheck`, then
  `git push --force-with-lease`.
- Create the PR with `gh pr create --base main --head role/<name>` when the user asks to merge.

## Commands

```bash
npm install                 # once, at the repo root (npm workspaces)
npm run dev:brain           # :8080  text API, /voice and /stage sockets, /debug/emit
npm run dev:stage           # :3000  /stage?sessionId=demo&debug=1, /card
npm run dev:channel         # :8081  Chert webhooks
npm run typecheck           # all packages
```

Stack: TypeScript everywhere, npm workspaces, Node 20.6+. Brain and Channel are plain Node `http` + `ws`, run
with `tsx`. Stage is Next.js 15 / React 19. Packages import shared code as `@odyssey/contracts` and
`@odyssey/story`.

## Reference

- [docs/architecture.md](docs/architecture.md) — how the pieces connect, and the key decisions
- [docs/handoffs.md](docs/handoffs.md) — who must tell whom what, by which hour
- [docs/timeline.md](docs/timeline.md) — phases, gates and fallbacks
- Team doc (the source for all of this): https://claude.ai/artifact/7KQ3Dus45vv7WDqrfyUpb6
