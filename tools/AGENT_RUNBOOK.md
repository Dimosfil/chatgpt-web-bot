# Agent Runbook — chatgpt-web-bot

Every command should be run from the project root: `D:\AI\chatgpt-web-bot`.

## Install

```powershell
npm install
```

Dependencies include `dotenv`, `playwright`, and `puppeteer`.

## Run

```powershell
.\start-server.ps1
```

Or directly:

```powershell
node src/server.js
```

The server listens on `http://127.0.0.1:3999`.

## Prerequisites

- Chrome is running with `--remote-debugging-port=9222`.
- A logged-in `https://chatgpt.com/` tab is open in Chrome.
- Node dependencies are installed.

Check Chrome CDP:

```powershell
curl.exe -s http://127.0.0.1:9222/json/version
```

## Smoke Check

```powershell
curl.exe -s http://127.0.0.1:3999/v1/models
curl.exe -s http://127.0.0.1:3999/health
curl.exe -s -X POST http://127.0.0.1:3999/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{\"model\":\"chatgpt-web\",\"messages\":[{\"role\":\"user\",\"content\":\"Привет! Ответь одним словом.\"}]}'
```

Expected result: an OpenAI-compatible JSON response with a non-empty assistant
message.

## Test

```powershell
node src/tests/test-openclaw.js
node src/tests/test-chrome.js
node src/tests/test-gateway.js
node src/tests/test-openclaw-gateway.js
node src/tests/test-openclaw-provider.js
```

## Logs

Use tails and targeted searches. Do not print full logs.

```powershell
Get-Content .\src\debug\requests.log -Tail 30
Get-Content .\src\debug\errors.log -Tail 20
Get-Content .\src\debug\prompt.log -Tail 5
Get-Content .\src\debug\response.log -Tail 5
Get-Content .\src\debug\optimized.log -Tail 5
Get-Content .\src\debug\payload.log -Tail 5
```

## Stop

```powershell
.\stop-server.ps1
```

Ask before stopping visible processes or restarting Chrome.

## Environment Notes

- `.env` controls port, timeouts, and modes.
- `CHATGPT_WEB_AGENT_MODE=1` enables agent mode with intent detection and tool call support.
- `CHATGPT_WEB_TIMEOUT=120000` sets the ChatGPT response timeout in milliseconds.
- If ChatGPT says it could not read the JSON request, check `readJsonBody()` and incoming JSON shape.
- If the service cannot get a ChatGPT Web response, check Chrome CDP, the chatgpt.com tab, and timeouts.
- If the text request is empty, check `promptBuilder.cleanUserOnly`.
