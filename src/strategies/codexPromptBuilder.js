/**
 * КОНТЕКСТ: Этот файл — отдельная логика ТОЛЬКО для Codex (не для OpenClaw).
 * Формирует промпт для ChatGPT с инструкциями про tool calls.
 * ChatGPT через веб-интерфейс не умеет function calling нативно,
 * поэтому мы просим его возвращать JSON с tool_call в определённом формате.
 */

const { safeJson } = require('../core/safeJson');

/**
 * Извлекает чистый текст из Codex-запроса.
 * Codex может слать input в разных форматах:
 * - строка
 * - массив { type: "message", role, content: [{ type: "input_text", text }] }
 * - массив строк
 * - объект с content/text
 */
function extractInput(body) {
  const input = body.input;

  if (typeof input === 'string') return input;

  if (Array.isArray(input)) {
    return input
      .map(item => {
        if (typeof item === 'string') return item;
        if (item.type === 'message' && item.content) {
          if (typeof item.content === 'string') return item.content;
          if (Array.isArray(item.content)) {
            return item.content
              .map(c => c.text || c.content || '')
              .filter(Boolean)
              .join('\n');
          }
          return '';
        }
        if (item.text) return item.text;
        if (item.content) return item.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof input === 'object' && input) {
    if (input.content) {
      if (typeof input.content === 'string') return input.content;
      if (Array.isArray(input.content)) {
        return input.content.map(c => c.text || c.content || '').filter(Boolean).join('\n');
      }
    }
    if (input.text) return input.text;
  }

  // Fallback: messages
  if (body.messages && Array.isArray(body.messages)) {
    return body.messages
      .filter(m => m.role === 'user')
      .map(m => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content.map(c => c.text || c.content || '').filter(Boolean).join('\n');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (body.prompt) return body.prompt;

  return '';
}

/**
 * Упрощает массив tools до читаемого списка для промпта.
 */
function simplifyTools(tools) {
  return (tools || [])
    .filter(t => t && t.type === 'function' && t.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {}
    }));
}

/**
 * Извлекает историю предыдущих tool_calls/tool_results из input-массива.
 * Codex присылает это в одном массиве с сообщениями.
 */
function extractToolHistory(inputArray) {
  if (!Array.isArray(inputArray)) return null;

  const toolCalls = [];
  const toolResults = [];

  for (const item of inputArray) {
    if (item.type === 'tool_call') {
      toolCalls.push(item);
    }
    if (item.type === 'tool_result') {
      toolResults.push(item);
    }
  }

  if (toolCalls.length === 0 && toolResults.length === 0) return null;

  return { toolCalls, toolResults };
}

/**
 * Формирует финальный промпт для ChatGPT.
 */
function buildCodexPrompt(body) {
  const userPrompt = extractInput(body);
  const tools = simplifyTools(body.tools || body.functions || []);
  const toolHistory = extractToolHistory(body.input);

  const parts = [];

  if (toolHistory) {
    parts.push('## Контекст предыдущих вызовов инструментов');
    parts.push('');

    if (toolHistory.toolCalls.length > 0) {
      parts.push('Были вызваны инструменты:');
      for (const tc of toolHistory.toolCalls) {
        parts.push(`- ${tc.name}(${safeJson(tc.arguments)})`);
      }
      parts.push('');
    }

    if (toolHistory.toolResults.length > 0) {
      parts.push('Результаты выполнения инструментов:');
      for (const tr of toolHistory.toolResults) {
        parts.push(`Инструмент: ${tr.name || '?'}`);
        parts.push(`Результат: ${safeJson(tr.content || tr.result || '')}`);
        parts.push('');
      }
    }
  }

  if (tools.length > 0) {
    parts.push('## Доступные инструменты');
    parts.push('Ты backend-агент. Можешь вызывать инструменты. Для этого верни JSON в таком формате (игнорируй markdown-форматирование, верни чистый JSON):');
    parts.push('');
    parts.push('```');
    parts.push('{"tool_call": {"name": "имя_инструмента", "arguments": {...}}}');
    parts.push('```');
    parts.push('');
    parts.push('Если задача решена текстом — просто ответь как обычно. Если в задаче просят читать файлы или запускать команды — почти наверняка нужен tool_call.');
    parts.push('');
    parts.push('### Инструменты:');
    parts.push(safeJson(tools));
    parts.push('');
    parts.push('ВАЖНО: Верни JSON ОДНОЙ СТРОКОЙ без лишних пробелов и переносов. Не оборачивай в ```json. Верни ТОЛЬКО строку с JSON.');
  }

  parts.push('## Запрос');
  parts.push(userPrompt);

  return parts.filter(Boolean).join('\n\n');
}

module.exports = {
  buildCodexPrompt,
  extractInput,
  simplifyTools,
  extractToolHistory
};
