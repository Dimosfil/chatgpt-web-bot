function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map(part => {
      if (typeof part === 'string') return part;
      return part.text || part.content || part.input_text || part.output_text || '';
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeRole(role) {
  if (role === 'developer') return 'system';
  if (role === 'function') return 'tool';
  return role || 'user';
}

function normalizeParameters(parameters) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    return { type: 'object', properties: {}, additionalProperties: false };
  }

  if (parameters.type === 'object') {
    return parameters;
  }

  return {
    ...parameters,
    type: 'object',
    properties: parameters.properties || {},
    additionalProperties: parameters.additionalProperties ?? false
  };
}

function normalizeChatMessages(body) {
  if (Array.isArray(body.messages)) {
    return body.messages.map(message => ({
      role: normalizeRole(message.role),
      content: textFromContent(message.content)
    }));
  }

  return responsesInputToMessages(body.input);
}

function responsesInputToMessages(input) {
  if (typeof input === 'string') {
    return [{ role: 'user', content: input }];
  }

  if (!Array.isArray(input)) {
    return [];
  }

  const messages = [];

  for (const item of input) {
    if (typeof item === 'string') {
      messages.push({ role: 'user', content: item });
      continue;
    }

    if (!item || typeof item !== 'object') continue;

    if (item.type === 'message') {
      messages.push({
        role: normalizeRole(item.role),
        content: textFromContent(item.content)
      });
      continue;
    }

    if (item.type === 'function_call' || item.type === 'tool_call') {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: item.call_id || item.id || `call_${Date.now()}`,
          type: 'function',
          function: {
            name: item.name,
            arguments: typeof item.arguments === 'string'
              ? item.arguments
              : JSON.stringify(item.arguments || {})
          }
        }]
      });
      continue;
    }

    if (item.type === 'function_call_output' || item.type === 'tool_result') {
      messages.push({
        role: 'tool',
        tool_call_id: item.call_id || item.tool_call_id || item.id,
        content: textFromContent(item.output || item.content || item.result || '')
      });
    }
  }

  return messages;
}

function normalizeTools(tools) {
  return (tools || [])
    .map(tool => {
      if (tool?.type === 'function' && tool.function) {
        return {
          ...tool,
          function: {
            ...tool.function,
            parameters: normalizeParameters(tool.function.parameters)
          }
        };
      }
      if (tool?.name) {
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: normalizeParameters(tool.parameters)
          }
        };
      }
      return null;
    })
    .filter(Boolean);
}

function resolveDeepSeekModel(body) {
  const requested = body.model || '';
  if (requested.startsWith('deepseek/')) {
    return requested.slice('deepseek/'.length);
  }
  if (requested === 'deepseek-chat' || requested === 'deepseek-reasoner') {
    return requested;
  }
  return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
}

function buildDeepSeekChatRequest(body, { stream = body.stream === true } = {}) {
  const payload = {
    model: resolveDeepSeekModel(body),
    messages: normalizeChatMessages(body),
    stream
  };

  const tools = normalizeTools(body.tools || body.functions);
  if (tools.length > 0) {
    payload.tools = tools;
    if (body.tool_choice) payload.tool_choice = body.tool_choice;
  }

  if (typeof body.temperature === 'number') payload.temperature = body.temperature;
  if (typeof body.max_tokens === 'number') payload.max_tokens = body.max_tokens;
  if (typeof body.top_p === 'number') payload.top_p = body.top_p;

  return payload;
}

module.exports = {
  buildDeepSeekChatRequest,
  normalizeChatMessages,
  normalizeParameters,
  normalizeRole,
  normalizeTools,
  resolveDeepSeekModel,
  responsesInputToMessages
};
