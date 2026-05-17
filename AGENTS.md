# Agent Instructions — chatgpt-web-bot

## Project

ChatGPT Web Bot — Express-совместимый HTTP-сервер-обёртка (порт 3999), который проксирует LLM-запросы в ChatGPT Web через Playwright + Chrome CDP.

### Архитектура

```
OpenClaw / Codex / Cursor / любой OpenAI-клиент
    │ POST /v1/chat/completions
    │ POST /v1/responses
    ▼
src/server.js (HTTP, порт 3999)
    ├── src/config.js          — CDP_URL, CHATGPT_URL, таймауты
    ├── src/core/http.js       — send(), readJsonBody()
    ├── src/core/logger.js     — логи в src/debug/
    ├── src/core/openaiResponse.js — форматы ответов (completion, responses, models)
    ├── src/core/safeJson.js   — утилиты для JSON
    ├── src/core/errorHandler.js — uncaughtException / unhandledRejection
    ├── src/clients/
    │   ├── detectClient.js    — детекция клиента по заголовкам/body
    │   └── cursorDetect.js    — детекция Cursor клиента
    ├── src/handlers/router.js — маршрутизация запросов
    │   ├── handleOpenClawRequest.js  — OpenClaw-режим
    │   ├── handleCodexFullFeature.js — Codex (Responses API + tool calls)
    │   ├── handleCodexRequest.js     — Legacy Codex
    │   ├── handleCursorRequest.js    — Cursor (chat completions через DeepSeek)
    │   ├── handleDeepSeekGateway.js  — DeepSeek gateway (Codex + OpenClaw)
    │   └── handleDefaultRequest.js   — простой чат
    ├── src/strategies/
    │   ├── llm.chatgptWeb.js         — Playwright → ChatGPT Web
    │   ├── llm.deepseek.js           — DeepSeek native API
    │   ├── promptBuilder.cleanUserOnly.js  — фильтр мусора из промпта
    │   ├── promptBuilder.agentToolMode.js  — промпт для agent mode
    │   ├── openclawOptimizer.js       — сжатие запроса (intent detection)
    │   ├── specialRequests.openclaw.js — системные запросы
    │   ├── codexPromptBuilder.js      — промпт для Codex
    │   ├── codexToolParser.js         — парсер tool call из ответа
    │   ├── cursorRequestBuilder.js    — конвертация Cursor → DeepSeek
    │   ├── deepseekRequestBuilder.js  — конвертация Codex → DeepSeek
    │   ├── toolParser.js              — парсер tool call (agent mode)
    │   └── replyReader.chatgptDom.js  — чтение ответа из DOM ChatGPT
    ├── steps/               — атомарные шаги для Playwright
    └── tests/               — тестовые скрипты для проверки связки
```

### Клиенты

- **OpenClaw** — `POST /v1/chat/completions`, JSON без `input`. Проходит через `openclawOptimizer` (сжатие сообщений, детект intent).
- **Codex CLI** — `POST /v1/responses` или `POST /v1/chat/completions` с `input`. Полноценные tool calls.
- **Cursor** — `POST /v1/chat/completions` со стандартными `messages` + `tools`. Всегда идёт через DeepSeek (нативный tool_calls). Детектится по заголовкам (`x-cursor-client`) или модели `cursor`.
- **Любой OpenAI-клиент** — простой чат, только последнее user-сообщение.
- **DeepSeek gateway** — включается через `CHATGPT_WEB_BACKEND=deepseek` или модель `deepseek/...`; использует native OpenAI-compatible `/chat/completions` вместо ChatGPT Web prompt-склейки.

### Архитектура Cursor + DeepSeek

```
Cursor IDE
    │ POST /v1/chat/completions
    │ { model: "cursor", messages: [...], tools: [...] }
    ▼
router.js → cursorDetect.js → handleCursorRequest.js
    │
    ├── cursorRequestBuilder.js  — нормализация messages + tools
    │
    ▼
llm.deepseek.js → DeepSeek API
    │
    ▼
Raw OpenAI-compatible ответ (tool_calls нативные)
```

Cursor использует DeepSeek как backend всегда — ChatGPT Web prompt-склейка не требуется,
потому что DeepSeek нативно поддерживает tools/function calling.

## Restore Context

```powershell
cd D:\AI\chatgpt-web-bot
git status --short
Get-ChildItem tools/summary/ | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { Get-Content $_.FullName }
```

## Durable Memory

- `tools/project-memory/` — архитектурные заметки, решения, известные проблемы
- `tools/project-memory/NOTES.md` — экспортированные заметки из SQLite
- `tools/project-memory/project_memory.sqlite` — SQLite БД памяти агентов (FTS5)
- `tools/summary/` — handoff-суммари после сессий
- `tools/AGENT_WORKING_AGREEMENTS.md` — правила работы агента в проекте
- `tools/AGENT_RUNBOOK.md` — команды запуска, проверки, логов и диагностики
- `tools/project-memory/instruction-kit.json` — версия локально скопированного набора инструкций

### Agent Memory SQLite

```powershell
# Инициализация БД (первый запуск)
node tools/project-memory/agent-memory.js init

# Индексация файлов проекта
node tools/project-memory/agent-memory.js index-files

# Добавить заметку
node tools/project-memory/agent-memory.js note "topic" "Title" "Body text" --evidence path/to/file

# Показать все заметки
node tools/project-memory/agent-memory.js notes

# Поиск (FTS5, fallback LIKE)
node tools/project-memory/agent-memory.js search "Playwright timeout"

# Записать failure
node tools/project-memory/agent-memory.js failure "Симптом" "Причина" "Решение" --evidence path

# Показать все failure-записи
node tools/project-memory/agent-memory.js failures

# Экспорт заметок в NOTES.md
node tools/project-memory/agent-memory.js export-notes

# Статистика БД
node tools/project-memory/agent-memory.js stats
```

## Common Commands

### Запуск сервера

```powershell
# Через start-server.ps1 (в корне проекта)
.\start-server.ps1

# Или напрямую
node src/server.js

# Сервер слушает http://127.0.0.1:3999
```

### Проверка работы

```powershell
# Список моделей
curl.exe -s http://127.0.0.1:3999/v1/models

# Простой запрос
curl.exe -s -X POST http://127.0.0.1:3999/v1/chat/completions -H "Content-Type: application/json" -d '{\"model\":\"chatgpt-web\",\"messages\":[{\"role\":\"user\",\"content\":\"Привет, как дела?\"}]}'

# Health-check
curl.exe -s http://127.0.0.1:3999/health

# Cursor запрос
curl.exe -s -X POST http://127.0.0.1:3999/v1/chat/completions -H "Content-Type: application/json" -H "x-cursor-client: true" -d '{\"model\":\"cursor\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'
```

### Остановка

```powershell
.\stop-server.ps1
```

### Логи

```powershell
# Все логи в src/debug/
Get-Content .\src\debug\requests.log -Tail 20
Get-Content .\src\debug\errors.log -Tail 20

# Полезные файлы
Get-Content .\src\debug\prompt.log -Tail 5
Get-Content .\src\debug\response.log -Tail 5
Get-Content .\src\debug\optimized.log -Tail 5
Get-Content .\src\debug\payload.log -Tail 5
```

### Тесты

```powershell
node src/tests/test-openclaw.js
node src/tests/test-gateway.js
node src/tests/test-cursor.js       # Cursor + DeepSeek
node src/tests/test-chrome.js       # проверка Chrome CDP
```

## Working Areas

- `src/` — весь исходный код
- `src/core/` — утилиты: HTTP, логи, OpenAI-форматы
- `src/clients/` — детекция клиентов (detectClient, cursorDetect)
- `src/handlers/` — обработчики запросов
- `src/strategies/` — бизнес-логика: промпты, оптимизация, LLM-стратегии
- `src/steps/` — Playwright-шаги
- `src/tests/` — тесты
- `.env` — конфигурация (порт, таймауты, режимы)
- `tools/` — проектные инструкции и память
- `.gitignore` — игнорирует `/node_modules`, `/logs`, `/debug`, профили Chrome

## Environment

- `.env` управляет портом (`CHATGPT_WEB_PORT=3999`), agent mode (`CHATGPT_WEB_AGENT_MODE=1`), таймаутами
- Для agent mode: `CHATGPT_WEB_AGENT_MODE=1` включает оптимизатор с intent detection и tool call support
- `CHATGPT_WEB_DEFAULT_CLIENT=codex` — клиент по умолчанию
- `CHATGPT_WEB_BACKEND=chatgpt_web|deepseek` выбирает backend по умолчанию.
- Для DeepSeek: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `DEEPSEEK_TIMEOUT`.
- Cursor-клиент всегда использует DeepSeek backend (независимо от `CHATGPT_WEB_BACKEND`).

## Critical Dependencies

- **Chrome** с открытым remote debugging портом 9222 (`--remote-debugging-port=9222`)
- **Playwright** — установлен в `node_modules`, браузер Chromium уже скачан
- **chatgpt.com** — открытая залогиненная вкладка в Chrome
- **DeepSeek API** — для Cursor и DeepSeek gateway (`DEEPSEEK_API_KEY`)

## Rules

- Agent edits and verifies; user reviews and commits.
- Do not revert user changes unless explicitly requested.
- Keep changes scoped to the current task.
- Ask before destructive operations, broad refactors, or Chrome restarts.
- Use targeted queries instead of dumping whole files.
- Follow `tools/AGENT_WORKING_AGREEMENTS.md` for shared working rules and `tools/AGENT_RUNBOOK.md` for command details.
- Treat `D:\AI\general-instructions` only as the bootstrap source for this local instruction kit, not as a runtime dependency, package, submodule, or symlink.
- Check accepted instruction-kit updates with `.\tools\check-instruction-kit-updates.ps1`; do not read the shared library `updates/` folder during project startup.
- Treat short chat commands that start with `gi` as shared instruction-kit commands for `D:\AI\general-instructions`, not as product work for this project.
- After completing a `gi` command, summarize only that instruction-kit command's result and stop; continue older product work only if the user explicitly asks to continue.
- On `gi summary` or `gi саммари`, create a concise handoff file under `tools/summary/YYYY-MM-DD_HH-mm-ss_AGENT_WORK_SUMMARY.md`; do not satisfy the command only by replying in chat.
- Instruction-kit refresh is idempotent: bootstrap/init first only when `tools/project-memory/instruction-kit.json` is missing; otherwise apply only pending accepted migrations from `VERSION.md`, `CHANGELOG.md`, `INDEX.md`, and `migrations/`.
- For commit-message language preferences, keep English as primary and do not infer extra languages from the user's UI or message language.
- If the user asks to choose commit-message languages without naming them, ask with a concise Markdown checklist showing English selected and optional Russian, Spanish, German, and French.
- Logs пишутся в `src/debug/` — проверяй через `-Tail`, не читай весь файл.
- `.env` — не коммитить, но изменения подсвечивать пользователю.
- Если ChatGPT Web отвечает «Я не смог прочитать JSON запроса» — проверяй `readJsonBody()` и формат входящего запроса.
- Если ответ пустой или таймаут — проверяй Chrome CDP (`http://127.0.0.1:9222/json/version`), вкладку chatgpt.com, таймауты в `.env`.

## Git Policy

- Default: agent edits and verifies; user reviews and commits.
- Не коммитить: `.env`, `node_modules/`, `src/debug/`, `logs/`, профили Chrome.
