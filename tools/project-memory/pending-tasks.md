# Pending Tasks

Use this file for active project-wide plans and multi-step work.

Keep entries concise and task-relevant. Do not store full diffs, large logs,
generated outputs, secrets, credentials, or private production data.

## Status Markers

- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[!]` blocked or needs attention

## Tasks

- [x] Add DeepSeek Dialog Manager / Reasoning Adapter.
  Goal: support DeepSeek thinking-mode tool loops without exposing hidden `reasoning_content`.
  Steps: add TTL store keyed by tool call id, rehydrate assistant tool-call messages before upstream requests, redact reasoning fields from logs/client responses, verify syntax and focused behavior.
  Risks: keep default `DEEPSEEK_THINKING=disabled`, avoid leaking chain-of-thought, do not disturb ChatGPT Web routing.

- [x] Apply instruction-kit migrations 2026.05.16.4 through 2026.05.16.6.
  Goal: merge accepted GI command and commit-language rules into local project instructions.
  Steps: update `AGENTS.md`, update `tools/AGENT_WORKING_AGREEMENTS.md`, verify update check.
  Risk: keep project-specific rules intact and avoid reading shared `updates/`.
