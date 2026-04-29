function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function simplifyTools(tools) {
  return (tools || [])
    .filter(t => t && t.type === 'function' && t.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {}
    }));
}

function buildAgentPrompt(body) {
  return `
Ты агент внутри OpenClaw.

Ты можешь использовать инструменты OpenClaw. Если нужно читать файл — вызывай read. Если нужно изменить файл — вызывай edit или write. Если нужно выполнить команду — вызывай exec.

ВАЖНО:
- Верни только JSON.
- Не добавляй markdown.
- Не добавляй пояснения.
- Не выдумывай инструменты.
- Используй только доступные tools.

Если нужен инструмент, ответь так:

{
  "tool_call": {
    "name": "read",
    "arguments": {
      "path": "server.js"
    }
  }
}
Для Windows-путей используй прямые слэши: C:/Users/Fil-Server/.openclaw/openclaw.json
Не используй одиночные обратные слэши.
Если инструмент не нужен, ответь так:

{
  "final": "ответ пользователю"
}

Доступные tools:

${safeJson(simplifyTools(body.tools || []))}

История сообщений:

${safeJson(body.messages || [])}
`.trim();
}

module.exports = {
  buildAgentPrompt
};