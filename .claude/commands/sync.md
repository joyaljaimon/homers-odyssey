---
description: Rebase on main, typecheck, push my branch, and offer to open a PR
---
1. Confirm I'm on my role branch (role/channel, role/brain, role/story or role/experience), not main.
2. Show uncommitted changes. If any are outside my role's folders, stop and ask.
3. Commit remaining changes with a message prefixed by my folder name, after showing it to me.
4. `git fetch origin && git rebase origin/main` — resolve conflicts with me if any.
5. `npm run typecheck`. If it fails, fix it (in my folders only) or stop and explain.
6. `git push --force-with-lease`.
7. Ask whether to open a PR into main with `gh pr create --base main --head <branch> --fill`.
8. Check docs/handoffs.md: if this work completes a handoff, draft the team-chat message for me.
