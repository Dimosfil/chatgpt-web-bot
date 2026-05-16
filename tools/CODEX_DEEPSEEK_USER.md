# User Guide: Codex + DeepSeek

This setup runs Codex through the local `chatgpt-web-bot` server. Codex talks to
`http://127.0.0.1:3999/v1`, and the server sends requests to DeepSeek.

## 1. Add the DeepSeek Key

Open:

```text
D:\AI\chatgpt-web-bot\.env
```

Set:

```env
CHATGPT_WEB_BACKEND=deepseek
DEEPSEEK_API_KEY=sk-your-real-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_TIMEOUT=120000
```

Do not commit or share `.env`.

## 2. Start the Gateway

In PowerShell:

```powershell
cd D:\AI\chatgpt-web-bot
.\start-server.ps1
```

If it says the server is already running, leave it running or restart it:

```powershell
.\stop-server.ps1
.\start-server.ps1
```

## 3. Check That It Works

```powershell
curl.exe -s http://127.0.0.1:3999/health
curl.exe -s http://127.0.0.1:3999/v1/models
```

Good signs:

- `/health` says `running`
- `/v1/models` shows `deepseek-chat`

## 4. Point Codex to the Gateway

Codex should use the local server as an OpenAI-compatible provider:

```toml
model = "deepseek/deepseek-chat"
model_provider = "chatgpt-web-bot"

[model_providers.chatgpt-web-bot]
name = "chatgpt-web-bot DeepSeek Gateway"
base_url = "http://127.0.0.1:3999/v1"
env_key = "OPENCLAW_API_KEY"
wire_api = "responses"
```

You can use the example:

```text
D:\AI\chatgpt-web-bot\Codex_config\config_custom.toml
```

`OPENCLAW_API_KEY` can be any non-empty value on the Codex side. The real
DeepSeek key stays in `D:\AI\chatgpt-web-bot\.env`.

## 5. Quick Request Test

```powershell
$body = @{
  model = "deepseek/deepseek-chat"
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

## Troubleshooting

If Codex cannot connect, check that the server is running:

```powershell
curl.exe -s http://127.0.0.1:3999/health
```

If DeepSeek does not answer, check that `DEEPSEEK_API_KEY` is filled in `.env`
and restart the server.

If PRO32 blocks PowerShell commands, add a trust rule for this project folder or
for the Codex launcher. The command pattern may look like
`powershell.exe -EncodedCommand ...`.

To stop the server:

```powershell
cd D:\AI\chatgpt-web-bot
.\stop-server.ps1
```
