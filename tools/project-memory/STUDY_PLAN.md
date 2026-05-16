# Study Plan — chatgpt-web-bot

Use this plan to map the project gradually. Do not load the whole repository into
context at once.

## First Pass

- [x] Identify entry points: `src/server.js`, `src/handlers/router.js`.
- [x] Identify main modules: `src/core/`, `src/handlers/`, `src/strategies/`, `src/steps/`.
- [x] Find run, test, smoke-check, and log commands in `tools/AGENT_RUNBOOK.md`.
- [x] Locate config and secret boundaries: `.env`, Chrome CDP, logged-in ChatGPT tab.
- [x] Locate tests and automation: `src/tests/`, root PowerShell start/stop scripts.

## Architecture Map

- [x] Runtime lifecycle.
- [x] Data flow.
- [x] External APIs or services.
- [ ] Persistence/storage.
- [ ] UI routes, screens, or scenes.
- [ ] Asset/template generation.

## Quality Gates

- [ ] Fast syntax or type check.
- [ ] Unit tests.
- [ ] Integration or smoke test.
- [ ] Build/package command.
- [ ] Log inspection command.

## Notes To Write

- [ ] `architecture.md`
- [ ] `decisions.md`
- [x] `known-issues.md`
