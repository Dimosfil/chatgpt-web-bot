# Agent Work Summary

Date: 2026-05-17 06:25:56 +03:00

## Current State

The project is on `master` and aligned with `origin/master`. The only local
uncommitted change is `.env`, which must remain uncommitted because it contains
local configuration and may contain secrets.

The server is running on this machine and serving Codex from another machine
through the LAN endpoint:

```text
http://192.168.3.55:3999/v1
```

Recent logs show Codex-style `/v1/responses` requests reaching DeepSeek and
returning HTTP `200`.

## What Changed

- Added LAN Codex provider config in `Codex_config/config_custom.toml`.
- Added `CHATGPT_WEB_HOST=0.0.0.0` to `.env.example`.
- Fixed DeepSeek Responses streaming for Codex.
- Normalized unsupported Codex roles before forwarding to DeepSeek:
  `developer` maps to `system`.
- Normalized tool schemas so DeepSeek accepts Codex tool definitions with empty
  or missing `parameters`.
- Aligned DeepSeek tool-call SSE events with the existing Codex stream format.
- Made `start-server.ps1` launch from the script directory instead of a hardcoded
  `C:\AI\chatgpt-web-bot` path.

## Commands Run

- `.\tools\check-instruction-kit-updates.ps1`
- `git status --short --branch`
- `git log --oneline -n 6`
- `Get-Content .\src\debug\requests.log -Tail 20`
- `node --check` on changed JavaScript files during fixes
- `.\stop-server.ps1; .\start-server.ps1`
- `git commit` and `git push` for the DeepSeek/Codex fixes

## Verification

- GI update check reports version `2026.05.16.8` with no pending migrations.
- `/v1/models` returns both `chatgpt-web` and `deepseek-chat`.
- Fresh request log entries show:

```text
POST /v1/responses ... model=deepseek/deepseek-chat ... stream=true
[DEEPSEEK] status=200
```

Recent successful DeepSeek request durations were around 850-917 ms.

## Known Failures Or Caveats

- `.env` is modified locally and intentionally not committed.
- Codex on the other machine must use the LAN provider:

```toml
model_provider = "chatgpt-web-bot-lan"
base_url = "http://192.168.3.55:3999/v1"
```

- `OPENCLAW_API_KEY` on the Codex machine only needs to be a non-empty dummy
  value; the real DeepSeek key stays in this server project's `.env`.
- If Codex still appears stuck, inspect `src/debug/requests.log`,
  `src/debug/errors.log`, and `src/debug/response.log` on this server machine
  before changing config.

## Next Best Steps

- Test one simple Codex request from the remote machine.
- If a response still does not render, inspect whether the model returned a tool
  call and whether Codex sent the follow-up tool result request.
- Keep committing only source/config-template changes; never stage `.env`.

## Git Status Snapshot

```text
## master...origin/master
 M .env
```

Recent commits:

```text
5ef2d45 Align DeepSeek tool call streaming
607f347 Normalize DeepSeek tool schemas
3533eca Fix DeepSeek Codex streaming hang
4de1e8a Add LAN Codex gateway config
db0214f Fix DeepSeek responses streaming events
2317363 Handle missing shared instruction paths
```
