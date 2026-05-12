# Known Issues — chatgpt-web-bot

## 1. OpenClaw CLI зависает на командах infer/model list

**Симптом:** `openclaw infer model run` и `openclaw model list` висят без вывода, убиваются по SIGKILL.

**Причина:** CLI требует WebSocket-соединения с gateway. Возможно проблема в драйвере `openai-completions` или в самом CLI. Не влияет на работу Telegram-бота — OpenClaw gateway отвечает на запросы нормально.

**Статус:** Не исправлено. Не критично — основной функционал работает через Telegram.

## 2. ChatGPT Web: «Я не смог прочитать JSON запроса»

**Симптом:** В ответ приходит `{"choices":[{"message":{"content":"Я не смог прочитать JSON запроса."}}]}`.

**Причина:** `readJsonBody()` в `src/core/http.js` не смог распарсить тело запроса. Обычно это значит, что запрос пришёл пустым или с бинарными данными.

**Статус:** Периодически проявляется. Наблюдается, когда OpenClaw шлёт запрос без тела.

## 3. Пустой ответ от ChatGPT Web

**Симптом:** `Сервис временно не смог получить ответ от ChatGPT Web.`

**Причина:** 
- Chrome CDP не отвечает (Chrome не запущен или упал)
- Вкладка chatgpt.com не залогинена
- Таймаут `CHATGPT_WEB_TIMEOUT` истёк
- playwrite не нашёл `#prompt-textarea` на странице

**Диагностика:**
```powershell
# Проверить Chrome CDP
curl.exe http://127.0.0.1:9222/json/version

# Проверить логи
Get-Content .\src\debug\errors.log -Tail 10
Get-Content .\src\debug\requests.log -Tail 10
```

**Статус:** Occasional. Требуется ручная проверка Chrome.

## 4. Agent mode: пустой tools после intent detection

**Симптом:** При `AGENT_MODE=1` оптимизатор определяет intent как `chat` и не передаёт tools в промпт.

**Причина:** Логика в `openclawOptimizer.js` — `detectToolIntent()` возвращает `chat` для простых вопросов, и `filterToolsByIntent('chat', ...)` возвращает пустой массив. Это intentional behavior.

**Как обойти:** Начать сообщение с `!tools` для форсированного `force_tools` intent'а.

## 5. Gateway не отвечает на внешние запросы

**Симптом:** curl на `http://127.0.0.1:18789` зависает.

**Причина:** Gateway настроен на loopback-only (`bind: "127.0.0.1"`). Это нормально — он только для локальных клиентов.

**Диагностика:**
```powershell
openclaw gateway status
```
