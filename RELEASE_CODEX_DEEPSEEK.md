# Codex + DeepSeek Release

This build runs an OpenAI-compatible local gateway for Codex and other clients,
with native DeepSeek chat completions behind it.

## Quick Start

```powershell
copy .env.example .env
# Edit .env and set DEEPSEEK_API_KEY.
npm install
.\start-server.ps1
```

The server listens on:

```text
http://127.0.0.1:3999
```

Useful endpoints:

```text
GET  /health
GET  /v1/models
POST /v1/chat/completions
POST /v1/responses
```

## Codex Client Settings

Use an OpenAI-compatible configuration:

```text
base_url = http://127.0.0.1:3999/v1
api_key  = any non-empty value
model    = gpt-5.4 or deepseek-v4-pro
```

The gateway maps compatible model aliases to `DEEPSEEK_MODEL`.

A sanitized example is included at:

```text
Codex_config\config_codex_deepseek_release.toml
```

## Environment

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

Do not commit `.env`.

## Verification

```powershell
npm run check
node src\tests\test-cursor-builder.js
Invoke-RestMethod http://127.0.0.1:3999/health
Invoke-RestMethod http://127.0.0.1:3999/v1/models
```

Optional live DeepSeek smoke:

```powershell
$body = @{
  model = 'gpt-5.4'
  messages = @(@{ role = 'user'; content = 'Say ok only.' })
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri http://127.0.0.1:3999/v1/chat/completions `
  -Method Post `
  -ContentType 'application/json' `
  -Body $body
```

## Notes

- DeepSeek `reasoning_content` is stripped from client responses and logs.
- Tool calls are preserved through OpenAI-compatible chat messages.
- Cursor integration is best-effort only. Cursor Free can block Agent/Ask before
  any local request reaches this gateway.
