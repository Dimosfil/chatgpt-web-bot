# Agent Working Agreements - chatgpt-web-bot

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
- If the user asks to choose commit-message languages without naming them, ask with a concise numbered Markdown checklist:
  - number every option;
  - show `English` as selected, primary, required, and not removable;
  - mark currently enabled additional languages as selected;
  - include `Russian`, `Spanish`, `German`, and `French`;
  - ask the user to reply with numbers or language names.
- If the user names commit-message languages explicitly, update `tools/project-memory/git-preferences.json` directly and summarize the new setting.
- Prefer `git diff --stat` and targeted `Select-String` over full `git diff`.

## Context Hygiene

- Do not read large files in full by default, including lockfiles, logs, generated files, and build artifacts.
- Treat the current project root as the default filesystem boundary. Do not inspect other project folders, nested checkouts, vendored source trees, user-home app data, IDE/browser profiles, shell history, telemetry, or application databases unless the user gives an explicit concrete path and action.
- Read local instructions, README/manifests, and config entry points first. Use broad recursive scans only after targeted search fails or the task clearly needs repository-wide inventory.
- Search for specific symbols, paths, errors, or patterns before broad repository scans.
- Do not print large logs. Prefer `Get-Content -Tail` and targeted error searches.
- Do not produce broad artifacts or run full check matrices unless the user explicitly asks for that scope.
- For web UI checks, assume the user will inspect manually unless they ask for screenshots or visual inspection.
- Keep progress updates phase-level and concise. Do not duplicate automatic tool counters or narrate every command.
- Optimize for smaller total live context: prefer compact handoffs, relevant file slices, targeted searches, and new sessions for unrelated tasks.

## Editing

- Prefer patch-style edits for manual changes.
- Avoid unrelated formatting churn.
- Add comments only when they clarify non-obvious behavior.
- Reread edited files after changes.
- Treat screenshots, logs, pasted errors, or other bug evidence as analysis-first requests. Explain the likely issue and ask what action the user wants before editing unless the user explicitly asks for a fix.

## Task Planning

- For analysis, refactoring, migration, or multi-step implementation tasks, create or update a concise checklist in `tools/project-memory/pending-tasks.md` or a dedicated task plan in `tools/project-memory/` before editing code.
- Include the goal, planned changes, execution order, risks or dependencies, and verification steps.
- Keep plans concise. Do not store full diffs, large logs, generated outputs, secrets, credentials, or private production data.

## Shared Instruction Updates

- This local instruction kit was bootstrapped from `D:\AI\general-instructions`.
- Treat that shared folder as a source used for copying local files, not as a live dependency, package, submodule, symlink, or runtime reference.
- Check accepted updates with `.\tools\check-instruction-kit-updates.ps1`.
- Treat short chat commands that start with `gi` as shared instruction-kit commands for `D:\AI\general-instructions`, not as `git`.
- `gi` is the only short command prefix for this copied instruction kit; do not rename it to `GAI` or add another short alias.
- Treat the instruction kit as a token-economy and RAG-startup layer: restore only task-relevant context from local instructions, handoff summaries, targeted searches, accepted migrations, and project memory.
- Run `gi ...` commands against the current project root. Do not switch to another repository, the shared instruction library, or a path from an older task unless the user explicitly asks.
- If the current project has no instruction-kit metadata, report that for the current project and ask what path or init action the user wants.
- After completing a `gi` command, summarize only that instruction-kit command's result and stop. Do not automatically resume older product tasks unless the user explicitly asks to continue.
- A successful `gi obnovit` / `gi obnovis` / `gi update` is an explicit request to commit and push only the resulting instruction-kit update files when the current project is a git repository with a configured remote. If git or a remote is unavailable, apply/check the update anyway and report that commit/push was skipped.
- On `gi summary` / `gi sammari`, create `tools/summary/` if needed and write a new concise handoff file named `YYYY-MM-DD_HH-mm-ss_AGENT_WORK_SUMMARY.md` with current state, changes, commands, verification, caveats, next steps, and git status.
- On `gi start` / `gi restore` and Russian restore aliases, restore context from local instructions, the latest handoff summary, and `tools/agent-start.ps1`; then ask what to do next.
- On `gi git summary` and Russian git-summary aliases, summarize the latest commit metadata, changed files, compact stats, inferred purpose, and risks without printing the full diff or changing files.
- On `gi test plan` and Russian test-plan aliases, inspect project-local verification options and produce a compact plan; do not run checks by default.
- On `gi pull` and Russian pull aliases, fetch and pull only the current branch from its configured upstream after inspecting status, current branch, and upstream. Stop on unsafe local changes, conflicts, missing git/upstream, or ambiguous conflict resolution.
- On `gi commit`, commit only scoped current changes. On `gi commit push` / `gi finish`, commit scoped current changes and push. On `gi push only`, push existing commits without creating a new commit.
- For `gi tm`, `gi post plan`, `gi start sprint`, `gi manager test`, and Russian aliases, use only project-local task-manager configuration from `tools/project-memory/task-managers.json`. Ask before enabling a manager, require a real project-specific API `base_url`, keep secrets out of config, and verify workflow capabilities before sending work or disposable lifecycle-test tasks.
- Treat task managers as queues and lifecycle metadata stores, not as the worker performing project work. The agent implements and verifies; the manager records, orders, assigns, and tracks work state.
- If task-manager intake accepts single-task or sprint-plan payloads, require executable lifecycle identifiers, reject unsupported payloads clearly, or document them as intake-only. Do not treat raw intake receipts as executable work.
- Instruction-kit refresh is idempotent: bootstrap/init first only when `tools/project-memory/instruction-kit.json` is missing; otherwise apply only pending accepted migrations.
- Read only accepted release artifacts for update checks: `VERSION.md`, `CHANGELOG.md`, `INDEX.md`, and relevant files under `migrations/`.
- Do not read the shared library `updates/` folder during project startup, bootstrap, or instruction-kit update checks.
- This project can be an experience source for `gi`: capture reusable workflows, repeated failure patterns, token-saving tactics, startup retrieval improvements, and instruction improvements as reviewable recommendations only.
- When this project reveals a reusable improvement, write a dated recommendation to the shared library's `updates/` folder only when explicitly working on instruction maintenance. Otherwise use a local fallback such as `tools/project-memory/instruction-updates/`.
- Recommendations must include the observed problem, proposed reusable rule or artifact, evidence paths or commands, expected benefit, risks, and privacy review. Do not include secrets, credentials, private user data, production data, or unnecessary project-specific details.
- Treat `gi system language` and Russian system-language aliases as project agent working-language commands stored in `tools/project-memory/system-preferences.json`. This setting is separate from commit-message language preferences and applies only to user-facing agent messages.

## Verification

- Run the fastest relevant check first.
- If changing server logic, restart the server only when needed, send a test request, and inspect log tails.
- After frontend, backend, API, or full-stack feature changes, restart the affected local runtime when run instructions provide a restart command or hot reload is uncertain; refresh the client/API caller before verification and mention skipped restarts.
- Record checks run and failures in the handoff summary after meaningful work.

## Processes

- The server runs as a background process. Do not kill it unless explicitly asked or required for the task.
- Chrome with CDP port `9222` must be running for ChatGPT Web integration.
- Ask before closing editors, apps, servers, or other visible processes.
- Launch GUI tools quietly in the background when possible.
