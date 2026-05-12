# Runbook — chatgpt-web-bot

Все команды из корня проекта: `C:\AI\chatgpt-web-bot`

## Install

```powershell
npm install
```

Зависимости: `dotenv`, `playwright`, `puppeteer` (установлено).

## Run

```powershell
# Скрипт (рекомендуется)
.\start-server.ps1

# Вручную
node src/server.js
```

Сервер запускается на `http://127.0.0.1:3999`.

## Prerequisites (перед запуском)

1. Chrome запущен с `--remote-debugging-port=9222`
2. В Chrome открыта залогиненная вкладка `https://chatgpt.com/`
3. Playwright установлен (`npm install` done)

Проверить Chrome CDP:

```powershell
curl.exe -s http://127.0.0.1:9222/json/version
```

## Smoke Check

```powershell
# 1. Сервер жив
curl.exe -s http://127.0.0.1:3999/v1/models

# 2. Модель chatgpt-web доступна — проверь, что id = "chatgpt-web"
curl.exe -s http://127.0.0.1:3999/health

# 3. Отправка сообщения
curl.exe -s -X POST http://127.0.0.1:3999/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{\"model\":\"chatgpt-web\",\"messages\":[{\"role\":\"user\",\"content\":\"Привет! Ответь одним словом.\"}]}'

# Ожидаемый результат: {"id":"chatcmpl-...","object":"chat.completion",...,"choices":[{"message":{"role":"assistant","content":"..."}}]}
```

## Logs

```powershell
# Основной лог запросов
Get-Content .\src\debug\requests.log -Tail 30

# Ошибки
Get-Content .\src\debug\errors.log -Tail 20

# Отправленные промпты (что ушло в ChatGPT)
Get-Content .\src\debug\prompt.log -Latest

# Ответы от ChatGPT
Get-Content .\src\debug\response.log -Latest

# Оптимизированные запросы (только в AGENT_MODE)
Get-Content .\src\debug\optimized.log -Latest

# Полные входящие payloads (осторожно: большие)
Get-Content .\src\debug\payload.log -Latest
```

## Test

```powershell
# Прямой тест сервера
node src/tests/test-openclaw.js

# Тест Chrome CDP
node src/tests/test-chrome.js

# Тест gateway-связки
node src/tests/test-gateway.js

# Полная диагностика
node src/tests/test-openclaw-gateway.js
node src/tests/test-openclaw-provider.js
```

## Остановка

```powershell
.\stop-server.ps1
# Или найти PID порта 3999:
netstat -ano | findstr :3999
# kill <PID>
```

## Environment Notes

- `.env` лежит в корне — меняет порт, таймауты, режимы.
- `CHATGPT_WEB_AGENT_MODE=1` — включает agent mode (intent detection, tool calls).
- `CHATGPT_WEB_TIMEOUT=120000` — таймаут ожидания ответа от ChatGPT (мс).
- Chrome должен быть открыт и залогинен в chatgpt.com до запуска сервера.
- Если ChatGPT отвечает «Я не смог прочитать JSON запроса» — скорее всего проблема в `readJsonBody()` или в формате входящего JSON.
- Если «Сервис временно не смог получить ответ от ChatGPT Web» — проверь Chrome CDP, вкладку chatgpt.com, таймауты.
- Если «Я не получил текст запроса» — промпт пустой после фильтрации (promptBuilder.cleanUserOnly вырезал всё как мусор).
