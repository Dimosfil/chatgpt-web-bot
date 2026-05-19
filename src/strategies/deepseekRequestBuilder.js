const INLINE_IMAGE_NOTICE = '[Inline image omitted: DeepSeek chat completions accepts text-only messages in this gateway. Do not call local image tools unless the user provided an explicit filesystem path.]';

function isInlineImagePart(part) {
  if (!part || typeof part !== 'object') return false;
  if (part.type === 'input_image' || part.type === 'image_url') return true;
  return Boolean(part.image_url);
}

function hasInlineImagesInContent(content) {
  return Array.isArray(content) && content.some(isInlineImagePart);
}

function hasInlineImages(body) {
  const containers = [];
  if (Array.isArray(body.messages)) containers.push(...body.messages);
  if (Array.isArray(body.input)) containers.push(...body.input);

  return containers.some((item) => {
    if (!item || typeof item !== 'object') return false;
    if (isInlineImagePart(item)) return true;
    return hasInlineImagesInContent(item.content);
  });
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map(part => {
      if (typeof part === 'string') return part;
      if (isInlineImagePart(part)) return INLINE_IMAGE_NOTICE;
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

function normalizeToolCall(call, fallbackId) {
  const fn = call?.function || {};
  const args = fn.arguments ?? call?.arguments ?? {};

  return {
    id: call?.id || fallbackId,
    type: 'function',
    function: {
      name: fn.name || call?.name || '',
      arguments: typeof args === 'string' ? args : JSON.stringify(args || {})
    }
  };
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
  const messages = Array.isArray(body.messages)
    ? normalizeOpenAiChatMessages(body.messages)
    : responsesInputToMessages(body.input);

  return normalizeDeepSeekToolMessagePairs(messages);
}

function normalizeOpenAiChatMessages(messages) {
  const normalized = [];
  const lastToolCallIdByName = new Map();

  messages.forEach((message, index) => {
    if (!message || typeof message !== 'object') return;

    const role = normalizeRole(message.role);
    const content = textFromContent(message.content);

    if (role === 'assistant') {
      const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls.map((call, callIndex) => {
          const normalizedCall = normalizeToolCall(call, call?.id || `call_${index}_${callIndex}`);
          if (normalizedCall.function.name) {
            lastToolCallIdByName.set(normalizedCall.function.name, normalizedCall.id);
          }
          return normalizedCall;
        })
        : [];

      if (!toolCalls.length && message.function_call) {
        const normalizedCall = normalizeToolCall(
          message.function_call,
          message.function_call.id || `call_${index}_0`
        );
        if (normalizedCall.function.name) {
          lastToolCallIdByName.set(normalizedCall.function.name, normalizedCall.id);
        }
        toolCalls.push(normalizedCall);
      }

      if (toolCalls.length) {
        normalized.push({
          role,
          content: content || null,
          tool_calls: toolCalls
        });
        return;
      }

      normalized.push({ role, content });
      return;
    }

    if (role === 'tool') {
      const toolCallId = message.tool_call_id
        || lastToolCallIdByName.get(message.name)
        || message.id;

      normalized.push({
        role,
        tool_call_id: toolCallId,
        content
      });
      return;
    }

    normalized.push({ role, content });
  });

  return normalized;
}

function normalizeDeepSeekToolMessagePairs(messages) {
  const normalized = [];

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];

    if (message?.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      const expectedIds = new Set(message.tool_calls.map(call => call?.id).filter(Boolean));
      const toolMessages = [];
      const seenIds = new Set();
      let j = i + 1;

      while (j < messages.length && messages[j]?.role === 'tool') {
        const toolMessage = messages[j];
        if (expectedIds.has(toolMessage.tool_call_id)) {
          toolMessages.push(toolMessage);
          seenIds.add(toolMessage.tool_call_id);
        }
        j += 1;
      }

      if (expectedIds.size > 0 && [...expectedIds].every(id => seenIds.has(id))) {
        normalized.push(message, ...toolMessages);
      }

      i = j - 1;
      continue;
    }

    if (message?.role === 'tool') {
      continue;
    }

    normalized.push(message);
  }

  return normalized;
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

function normalizeTools(tools, options = {}) {
  const omitNames = new Set(options.omitNames || []);

  return (tools || [])
    .map(tool => {
      if (tool?.type === 'function' && tool.function) {
        if (omitNames.has(tool.function.name)) return null;
        return {
          ...tool,
          function: {
            ...tool.function,
            parameters: normalizeParameters(tool.function.parameters)
          }
        };
      }
      if (tool?.name) {
        if (omitNames.has(tool.name)) return null;
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

function resolveThinking(body, model) {
  if (body.thinking && typeof body.thinking === 'object') {
    return body.thinking;
  }

  const configured = (process.env.DEEPSEEK_THINKING || '').trim().toLowerCase();
  if (configured === 'enabled' || configured === 'disabled') {
    return { type: configured };
  }

  if (model.startsWith('deepseek-v4-')) {
    return { type: 'disabled' };
  }

  return null;
}

function buildDeepSeekChatRequest(body, { stream = body.stream === true } = {}) {
  const model = resolveDeepSeekModel(body);
  const containsInlineImages = hasInlineImages(body);
  const payload = {
    model,
    messages: normalizeChatMessages(body),
    stream
  };

  if (containsInlineImages) {
    payload.messages.unshift({
      role: 'system',
      content: 'The current request includes inline image data, but this DeepSeek gateway can only forward text content. Explain this limitation briefly if the user asks about the image. Do not call view_image for attached inline images; use image tools only when the user provides a concrete local image file path.'
    });
  }

  const tools = containsInlineImages
    ? []
    : normalizeTools(body.tools || body.functions);
  if (tools.length > 0) {
    payload.tools = tools;
    if (body.tool_choice) payload.tool_choice = body.tool_choice;
  }

  if (typeof body.temperature === 'number') payload.temperature = body.temperature;
  if (typeof body.max_tokens === 'number') payload.max_tokens = body.max_tokens;
  if (typeof body.top_p === 'number') payload.top_p = body.top_p;

  const thinking = resolveThinking(body, model);
  if (thinking) payload.thinking = thinking;

  return payload;
}

module.exports = {
  buildDeepSeekChatRequest,
  hasInlineImages,
  hasInlineImagesInContent,
  normalizeChatMessages,
  normalizeDeepSeekToolMessagePairs,
  normalizeOpenAiChatMessages,
  normalizeParameters,
  normalizeRole,
  normalizeToolCall,
  normalizeTools,
  resolveDeepSeekModel,
  resolveThinking,
  responsesInputToMessages
};
