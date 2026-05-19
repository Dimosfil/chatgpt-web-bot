# Codex + DeepSeek Release

This release is for Codex and other OpenAI-compatible clients using the
Responses API through a local DeepSeek-backed gateway.

## Quick Start

```powershell
copy .env.example .env
# Edit .env and set DEEPSEEK_API_KEY.
npm install
.\start-server.ps1
```

Gateway URL:

```text
http://127.0.0.1:3999/v1
```

## Codex Config

Use the included sanitized config:

```text
Codex_config\config_codex_deepseek_release.toml
```

Equivalent config:

```toml
model = "deepseek/deepseek-v4-pro"
model_provider = "chatgpt-web-bot"

[model_providers.chatgpt-web-bot]
name = "chatgpt-web-bot DeepSeek Gateway"
base_url = "http://127.0.0.1:3999/v1"
env_key = "OPENCLAW_API_KEY"
wire_api = "responses"
```

`OPENCLAW_API_KEY` only needs to be non-empty for the client. The real DeepSeek
key stays in `.env`.

## Required Environment

```dotenv
CHATGPT_WEB_PORT=3999
CHATGPT_WEB_HOST=0.0.0.0
CHATGPT_WEB_BACKEND=deepseek
CHATGPT_WEB_AGENT_MODE=1
CHATGPT_WEB_DEFAULT_CLIENT=codex
CHATGPT_WEB_TIMEOUT=120000

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_TIMEOUT=120000
```

## Verify

```powershell
npm run check
Invoke-RestMethod http://127.0.0.1:3999/health
Invoke-RestMethod http://127.0.0.1:3999/v1/models
```

Responses API smoke:

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

## Notes

- DeepSeek `reasoning_content` is stripped from client responses and logs.
- `.env`, logs, browser profiles, `.git`, `node_modules`, and local debug files
  are not included in the release archive.

