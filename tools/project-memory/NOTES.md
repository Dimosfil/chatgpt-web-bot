# Durable Notes вЂ” chatgpt-web-bot

РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЌРєСЃРїРѕСЂС‚РёСЂРѕРІР°РЅРѕ РёР· `project_memory.sqlite`.
SQLite вЂ” Р»РѕРєР°Р»СЊРЅС‹Р№ РїРѕРёСЃРєРѕРІС‹Р№ РёРЅРґРµРєСЃ, СЌС‚РѕС‚ Markdown вЂ” С‡РµР»РѕРІРµРєРѕС‡РёС‚Р°РµРјР°СЏ РєРѕРїРёСЏ.

---

## architecture: Архитектура проекта

_Created: 2026-05-12 05:57:12 | ID: #1_

HTTP-сервер на порту 3999. Проксирует запросы в ChatGPT Web через Playwright + Chrome CDP. Три режима: OpenClaw, Codex, default. Модули: src/core/ (утилиты), src/handlers/ (обработчики), src/strategies/ (промпты, оптимизация), src/steps/ (Playwright-шаги).

_Evidence: `C:/AI/chatgpt-web-bot/src/server.js'_

---

## architecture: Agent Mode оптимизатор

_Created: 2026-05-12 05:57:16 | ID: #2_

CHATGPT_WEB_AGENT_MODE=1 включает openclawOptimizer.js. Детектит intent из текста (chat, file_read, file_write, exec, web, memory, force_tools). Для chat не передаёт tools в промпт — LLM отвечает только текстом. Можно форсировать tools через !tools в начале сообщения.

_Evidence: `C:/AI/chatgpt-web-bot/src/strategies/openclawOptimizer.js'_

---

## architecture: Маршрутизация запросов (router.js)

_Created: 2026-05-12 06:16:46 | ID: #3_

router.js определяет клиента из заголовка X-OpenClaw или X-Codex-Client. Три режима: handleOpenClawRequest (OpenClaw с intent detection), handleCodexFullFeature (Codex с tool calls), handleDefaultRequest (простой чат, только последнее user-сообщение).

_Evidence: `C:/AI/chatgpt-web-bot/src/handlers/router.js'_

---

## architecture: HTTP-утилиты (http.js)

_Created: 2026-05-12 06:16:50 | ID: #4_

readJsonBody() — читает тело запроса как JSON, поддерживает стриминг (request.pipe()). send() — универсальная отправка ответа с JSON или SSE (Server-Sent Events). handle SSE через writeSSE() с флагами done и toolCalls.

_Evidence: `C:/AI/chatgpt-web-bot/src/core/http.js'_

---

## architecture: Форматы ответов OpenAI (openaiResponse.js)

_Created: 2026-05-12 06:16:54 | ID: #5_

Два формата: completion() для /v1/chat/completions (choices[{message}]), response() для /v1/responses (output[{content}]). modelsList() возвращает список доступных моделей ['chatgpt-web']. Все функции генерируют id, timestamps, usage.

_Evidence: `C:/AI/chatgpt-web-bot/src/core/openaiResponse.js'_

---

## architecture: CodeX tool call pipeline

_Created: 2026-05-12 06:17:00 | ID: #6_

handleCodexFullFeature.js — обрабатывает /v1/responses для Codex CLI. Логика: buildMessageHistory() → createSystemPrompt() → createPrompt() → sendToChatGPT() → buildResponse(). Парсит tool call из ответа ChatGPT через codexToolParser.js. toolCall в промпт добавляется через addToolCallToMessages().

_Evidence: `C:/AI/chatgpt-web-bot/src/handlers/handleCodexFullFeature.js'_

---

## architecture: Prompt Builders стратегии

_Created: 2026-05-12 06:17:04 | ID: #7_

promptBuilder.cleanUserOnly.js — фильтрует сообщения: достаёт только последнее user-сообщение, удаляет системные промпты и префиксы мусора. promptBuilder.agentToolMode.js — собирает контекст из system + user + assistant сообщений с tool call разметкой для agent mode.

_Evidence: `C:/AI/chatgpt-web-bot/src/strategies'_

---

## architecture: Playwright стратегия (llm.chatgptWeb.js)

_Created: 2026-05-12 06:17:09 | ID: #8_

sendMessage() — подключается к Chrome CDP (http://127.0.0.1:9222), находит вкладку chatgpt.com, вводит текст в #prompt-textarea, отправляет, ждёт ответ. findTargetPage() ищет вкладку по URL chatgpt.com. isThinkingMode() проверяет наличие spinner на странице. getResponse() читает содержимое .markdown или .prose.

_Evidence: `C:/AI/chatgpt-web-bot/src/strategies/llm.chatgptWeb.js'_

---

## configuration: Конфигурация (.env/config.js)

_Created: 2026-05-12 06:17:13 | ID: #9_

config.js загружает .env. Ключи: CHATGPT_WEB_PORT (3999), CHATGPT_WEB_CDP_URL (http://127.0.0.1:9222), CHATGPT_WEB_CHATGPT_URL (https://chatgpt.com/), CHATGPT_WEB_TIMEOUT (120000ms), CHATGPT_WEB_AGENT_MODE (0/1), CHATGPT_WEB_AGENT_MODE_TIMEOUT (180000ms). Все ключи имеют значения по умолчанию.

_Evidence: `C:/AI/chatgpt-web-bot/src/config.js'_

---

## known-issues: OpenClaw CLI зависает

_Created: 2026-05-12 06:17:17 | ID: #10_

Команды openclaw infer model run и openclaw model list зависают без вывода. Причина: CLI требует WebSocket к gateway. Не влияет на Telegram-бота. Статус: не исправлено.

_Evidence: `C:/Users/Fil-Server/.openclaw/workspace/MEMORY.md'_

---

## known-issues: Пустой ответ от ChatGPT Web

_Created: 2026-05-12 06:17:20 | ID: #11_

Симптом: 'Сервис временно не смог получить ответ от ChatGPT Web'. Причины: Chrome CDP не отвечает, вкладка не залогинена, таймаут, playwrite не нашёл #prompt-textarea. Диагностика: curl http://127.0.0.1:9222/json/version

_Evidence: `C:/AI/chatgpt-web-bot/tools/project-memory/known-issues.md'_

---
