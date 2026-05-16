# Agent Working Agreements — chatgpt-web-bot

## Scope

- Keep changes small and tied to the current request.
- Ask before expanding into unrelated modules.
- If a task requires files outside `src/`, `.env`, or `tools/`, say so first.

## User Changes

- Do not revert user changes unless explicitly requested.
- Treat dirty worktrees as normal.
- If user changes affect the task, work with them instead of overwriting.

## Git

- Default: the agent edits and verifies; the user reviews and commits.
- No branch naming convention is required in this project unless the user asks for one.
- Never commit `.env`, `node_modules/`, `src/debug/`, `logs/`, `chrome-debug-profile/`, or `pw-profile/`.
- Follow `tools/project-memory/git-preferences.json` for commit-message languages when the user explicitly asks the agent to commit.
- Keep English as the primary commit-message language. Do not infer extra commit-message languages from the user's UI language or message language.
- If the user asks to choose commit-message languages without naming them, ask with a concise Markdown checklist:
  - show `English` as selected and primary;
  - mark currently enabled additional languages as selected;
  - include `Russian`, `Spanish`, `German`, and `French`;
  - ask the user to reply with language names or numbers.
- If the user names commit-message languages explicitly, update `tools/project-memory/git-preferences.json` directly and summarize the new setting.
- Prefer `git diff --stat` and targeted `Select-String` over full `git diff`.

## Context Hygiene

- Do not read large files in full by default, including lockfiles, logs, generated files, and build artifacts.
- Search for specific symbols, paths, errors, or patterns before broad repository scans.
- Do not print large logs. Prefer `Get-Content -Tail` and targeted error searches.
- Do not produce broad artifacts or run full check matrices unless the user explicitly asks for that scope.
- For web UI checks, assume the user will inspect manually unless they ask for screenshots or visual inspection.

## Editing

- Prefer patch-style edits for manual changes.
- Avoid unrelated formatting churn.
- Add comments only when they clarify non-obvious behavior.
- Reread edited files after changes.

## Task Planning

- For analysis, refactoring, migration, or multi-step implementation tasks, create or update a concise checklist in `tools/project-memory/pending-tasks.md` or a dedicated task plan in `tools/project-memory/` before editing code.
- Include the goal, planned changes, execution order, risks or dependencies, and verification steps.
- Keep plans concise. Do not store full diffs, large logs, generated outputs, secrets, credentials, or private production data.

## Shared Instruction Updates

- This local instruction kit was bootstrapped from `D:\AI\general-instructions`.
- Treat that shared folder as a source used for copying local files, not as a live dependency, package, submodule, symlink, or runtime reference.
- Check accepted updates with `.\tools\check-instruction-kit-updates.ps1`.
- Treat short chat commands that start with `gi` as shared instruction-kit commands for `D:\AI\general-instructions`.
- Instruction-kit refresh is idempotent: bootstrap/init first only when `tools/project-memory/instruction-kit.json` is missing; otherwise apply only pending accepted migrations.
- Read only accepted release artifacts for update checks: `VERSION.md`, `CHANGELOG.md`, `INDEX.md`, and relevant files under `migrations/`.
- Do not read the shared library `updates/` folder during project startup, bootstrap, or instruction-kit update checks.
- When this project reveals a reusable improvement, write a dated recommendation to the shared library's `updates/` folder only when explicitly working on instruction maintenance.

## Verification

- Run the fastest relevant check first.
- If changing server logic, restart the server only when needed, send a test request, and inspect log tails.
- Record checks run and failures in the handoff summary after meaningful work.

## Processes

- The server runs as a background process. Do not kill it unless explicitly asked or required for the task.
- Chrome with CDP port `9222` must be running for ChatGPT Web integration.
- Ask before closing editors, apps, servers, or other visible processes.
- Launch GUI tools quietly in the background when possible.
