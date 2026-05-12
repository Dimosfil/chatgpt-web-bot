# Working Agreements — chatgpt-web-bot

## Scope

- Keep changes small and tied to the current request.
- Ask before expanding into unrelated modules (e.g., don't refactor `steps/` when fixing a `strategies/` bug).
- If a task requires files outside `src/`, `.env`, `tools/`, say so first.

## User Changes

- Do not revert user changes unless explicitly requested.
- Treat dirty worktrees as normal — user can have uncommitted edits.
- If user changes affect the task, work with them, don't overwrite.

## Git

- Default: agent edits and verifies; user reviews and commits.
- No branch naming convention — user manages branches.
- **Never commit**: `.env`, `node_modules/`, `src/debug/`, `logs/`, chrome profiles (`chrome-debug-profile/`, `pw-profile/`).
- Generated files: `src/debug/*.log`, `logs/` — gitignored, not committed.
- Prefer `git diff --stat` + targeted `Select-String` over full `git diff`.

## Editing

- Prefer patch-style edits (targeted text replacements) over full-file rewrites.
- Avoid unrelated formatting churn — no prettier/whitespace-only changes.
- Add comments only when they clarify non-obvious behavior.
- After any edit, reread the changed file to verify it's correct.

## Verification

After changes:
1. Reread edited files — confirm correctness.
2. Run the fastest relevant check: `curl http://127.0.0.1:3999/v1/models`
3. If changing server logic: restart server, send test request, check logs.
4. Record checks and failures in handoff summary.

## Processes

- **Server** runs as background process (`Start-Process`). Do not kill unless explicitly asked.
- **Chrome** with CDP port 9222 must be running. Restart only if Chrome hangs.
- Ask before closing editors, apps, servers, or other visible processes.
- Launch GUI tools quietly in the background when possible.

## Communication

- Если нашли проблему — сразу запиши в `tools/project-memory/known-issues.md`.
- Если решение неочевидное — добавь комментарий в код.
- В summary пиши: что изменили, что проверили, что не работает.
