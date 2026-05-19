# Agent Runbook: Codex + DeepSeek

Use this when the user wants Codex to work through this local OpenAI-compatible
gateway with DeepSeek as the backend.

## Scope

- Project root: `D:\AI\chatgpt-web-bot`
- Gateway URL for clients: `http://127.0.0.1:3999/v1`
- Server process: `node src/server.js`
- DeepSeek mode: `CHATGPT_WEB_BACKEND=deepseek`
- Codex provider config example: `Codex_config\config_custom.toml`

Do not commit `.env`. It contains local secrets.

## Required `.env`

Check that `.env` contains:

```env
CHATGPT_WEB_PORT=3999
CHATGPT_WEB_AGENT_MODE=1
CHATGPT_WEB_DEFAULT_CLIENT=codex
CHATGPT_WEB_BACKEND=deepseek

DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_TIMEOUT=120000
```

`DEEPSEEK_API_KEY` must be set. Keep it out of logs, summaries, commits, and
chat responses.

## Codex Config

Codex should point to the local gateway, not directly to DeepSeek:

```toml
model = "deepseek/deepseek-v4-pro"
model_provider = "chatgpt-web-bot"

[model_providers.chatgpt-web-bot]
name = "chatgpt-web-bot DeepSeek Gateway"
base_url = "http://127.0.0.1:3999/v1"
env_key = "OPENCLAW_API_KEY"
wire_api = "responses"
```

The key named by `env_key` only needs to be non-empty for the client side. The
real DeepSeek key lives in this project's `.env`.

## Start

Run from `D:\AI\chatgpt-web-bot`:

```powershell
.\start-server.ps1
```

If the port is already busy:

```powershell
.\stop-server.ps1
.\start-server.ps1
```

Do not restart Chrome unless the user approves. In DeepSeek mode, Chrome CDP is
not required for native DeepSeek requests, but `chatgpt_web` fallback still
depends on Chrome with remote debugging.

## Verify

Use the fastest checks first:

```powershell
curl.exe -s http://127.0.0.1:3999/health
curl.exe -s http://127.0.0.1:3999/v1/models
```

Expected `/v1/models` includes `deepseek-v4-pro`.

Then test a Codex-style Responses API call:

```powershell
$body = @{
  model = "deepseek/deepseek-v4-pro"
  input = "Reply with one word: ok"
  stream = $false
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Uri "http://127.0.0.1:3999/v1/responses" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body `
  -TimeoutSec 120
```

If testing Chat Completions:

```powershell
$body = @{
  model = "deepseek-v4-pro"
  messages = @(@{ role = "user"; content = "Reply with one word: ok" })
  stream = $false
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Uri "http://127.0.0.1:3999/v1/chat/completions" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body `
  -TimeoutSec 120
```

## Logs

Use tails only:

```powershell
Get-Content .\src\debug\requests.log -Tail 30
Get-Content .\src\debug\response.log -Tail 20
Get-Content .\src\debug\errors.log -Tail 20
Get-Content .\src\debug\payload.log -Tail 10
```

## Common Failures

- `DEEPSEEK_API_KEY` is empty: fill `.env`, restart server, retest.
- `/v1/models` lacks `deepseek-v4-pro`: check `CHATGPT_WEB_BACKEND=deepseek` and
  restart the server.
- Codex says unauthorized: set the client-side env var named by `env_key`
  (`OPENCLAW_API_KEY`) to any non-empty value, and keep the real key in `.env`.
- PRO32 or another antivirus blocks `powershell.exe -EncodedCommand`: use
  explicit `PowerShell -Command` checks or add a trust rule for the Codex
  launcher/project folder.
- Empty or timeout response: inspect `src/debug/errors.log` and
  `src/debug/payload.log` with `-Tail`; do not dump full logs.
