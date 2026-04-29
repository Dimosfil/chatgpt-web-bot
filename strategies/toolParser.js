function extractJsonLike(text) {
  if (!text) return '';

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');

  if (first >= 0 && last > first) {
    return text.slice(first, last + 1).trim();
  }

  return text.trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {}

  // ремонтируем Windows backslashes: C:\Users\... -> C:\\Users\\...
  try {
    const repaired = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    return JSON.parse(repaired);
  } catch {}

  return null;
}

function tryParseAgentReply(text) {
  const raw = String(text || '').trim();
  const jsonText = extractJsonLike(raw);
  const json = safeJsonParse(jsonText);

  if (!json) {
    return {
      type: 'final',
      text: raw
    };
  }

  if (json.tool_call && json.tool_call.name) {
    return {
      type: 'tool_call',
      toolCall: {
        name: json.tool_call.name,
        arguments: json.tool_call.arguments || {}
      }
    };
  }

  if (json.final !== undefined) {
    return {
      type: 'final',
      text: String(json.final || '')
    };
  }

  return {
    type: 'final',
    text: raw
  };
}

function tryParseToolCall(text) {
  const parsed = tryParseAgentReply(text);
  return parsed.type === 'tool_call' ? parsed.toolCall : null;
}

module.exports = {
  tryParseToolCall,
  tryParseAgentReply
};