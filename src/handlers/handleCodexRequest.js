const { log } = require('../core/logger');
const { buildPrompt } = require('../strategies/promptBuilder.cleanUserOnly');
const { ChatGptWebStrategy } = require('../strategies/llm.chatgptWeb');
const { tryParseAgentReply } = require('../strategies/toolParser');
const { send } = require('../core/http');
const {
  responsesOutput,
  responsesOutputWithToolCall
} = require('../core/openaiResponse');

const {
  safeJson,
  jsonSize,
  writeBlock,
  sendCompletionLogged,
  sendToolCallLogged
} = require('./responseHelpers');

const llmStrategy = new ChatGptWebStrategy();

function simplifyTools(tools) {
  return (tools || [])
    .filter(t => t && t.type === 'function' && t.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {}
    }));
}

function extractInput(body, requestId) {
  // Codex with wire_api=responses sends { input: string | { type: "message", content } }
  // Fallback: messages array, or input_text
  let text = '';

  try {
    const fs = require('fs');
    fs.appendFileSync('C:\\AI\\chatgpt-web-bot\\logs\\extract_debug.log',
      `[${requestId}] body keys=${Object.keys(body).join(',')} inputType=${typeof body.input} inputIsArr=${Array.isArray(body.input)} hasMessages=${!!body.messages} hasPrompt=${!!body.prompt}\n`
    );
    fs.appendFileSync('C:\\AI\\chatgpt-web-bot\\logs\\extract_debug.log',
      `[${requestId}] body.input=${JSON.stringify(body.input)?.slice(0, 200)}\n`
    );
  } catch (e) {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`extract debug: ${e.message}\n`);
    }
  }

  if (typeof body.input === 'string') {
    text = body.input;
  } else if (Array.isArray(body.input)) {
    // Codex может слать input как массив сообщений
    text = body.input
      .map(item => {
        if (typeof item === 'string') return item;
        if (item.type === 'message' && item.content) {
          if (typeof item.content === 'string') return item.content;
          return item.content.map?.(c => c.text || c.content || '').join(' ') || '';
        }
        if (item.text) return item.text;
        if (item.content) return item.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  } else if (typeof body.input === 'object' && body.input) {
    try {
      const fs = require('fs');
      fs.appendFileSync('C:\\AI\\chatgpt-web-bot\\logs\\extract_debug.log',
        `[${requestId}] object input keys=${Object.keys(body.input).join(',')}\n`
      );
    } catch (e) {}

    if (body.input.content) {
      text = typeof body.input.content === 'string'
        ? body.input.content
        : body.input.content.map?.(c => c.text || c.content || '').join(' ') || '';
    } else if (body.input.text) {
      text = body.input.text;
    } else if (body.input.type === 'message' && body.input.content) {
      text = typeof body.input.content === 'string'
        ? body.input.content
        : body.input.content.map?.(c => c.text || '').join(' ') || '';
    } else {
      // Если не смогли, попробуем просто JSON
      text = JSON.stringify(body.input).slice(0, 500);
    }
  } else if (body.messages && Array.isArray(body.messages)) {
    text = buildPrompt(body.messages);
  } else if (body.prompt) {
    text = body.prompt;
  }

  return text;
}

function extractTools(body) {
  const tools = body.tools || body.functions || [];

  return simplifyTools(tools);
}

function buildCodexPrompt(body, requestId) {
  const userPrompt = extractInput(body, requestId);
  const tools = extractTools(body);

  if (!tools.length) {
    return userPrompt;
  }

  return [
    'Ты backend-агент для Codex CLI.',
    '',
    'Ты можешь вызывать инструменты, возвращая JSON:',
    '{',
    '  "tool_call": {',
    '    "name": "tool_name",',
    '    "arguments": {}',
    '  }',
    '}',
    '',
    'Если задача выполнена без вызова инструментов, ответь как обычно.',
    'Не используй markdown для JSON.',
    '',
    'Доступные инструменты:',
    safeJson(tools),
    '',
    'Запрос пользователя:',
    userPrompt
  ].join('\n');
}

/**
 * @param {'chat'|'responses'} apiType - какой API формат ожидает клиент
 */
async function handleCodexRequest(req, res, body, requestId, apiType = 'chat') {
  const prompt = buildCodexPrompt(body, requestId);

  writeBlock(
    'prompt.log',
    `CODEX -> CHATGPT_WEB ${requestId}`,
    prompt || '[EMPTY PROMPT]'
  );

  if (!prompt || !prompt.trim()) {
    log('errors.log', `[${requestId}] Codex empty prompt`);

    if (apiType === 'responses') {
      if (body.stream === true) {
        sendResponsesStream(res, body, 'Empty prompt.', requestId);
        return;
      }
      return send(res, 200, responsesOutput(body, 'Empty prompt.'));
    }

    return sendCompletionLogged(
      body,
      res,
      'Empty prompt.',
      requestId,
      'CODEX'
    );
  }

  try {
    const startedAt = Date.now();

    log('requests.log', `[${requestId}] [CODEX LLM] start apiType=${apiType}`);

    const reply = await llmStrategy.generate(prompt);

    writeBlock(
      'response.log',
      `CHATGPT_WEB -> CODEX SERVER ${requestId}`,
      reply || '[EMPTY REPLY]'
    );

    log(
      'requests.log',
      `[${requestId}] [CODEX LLM] ok durationMs=${Date.now() - startedAt} replyChars=${reply?.length || 0}`
    );

    const hasTools = (body.tools && body.tools.length > 0) || (body.functions && body.functions.length > 0);

    if (hasTools) {
      const parsed = tryParseAgentReply(reply);

      if (parsed && parsed.type === 'tool_call') {
        if (apiType === 'responses') {
          if (body.stream === true) {
            sendResponsesStreamToolCall(res, body, parsed.toolCall, requestId);
            return;
          }
          return send(res, 200, responsesOutputWithToolCall(body, parsed.toolCall));
        }

        return sendToolCallLogged(body, res, parsed.toolCall, requestId, 'CODEX');
      }

      if (parsed && parsed.type === 'final' && parsed.text !== reply) {
        const text = parsed.text || 'Done.';

        if (apiType === 'responses') {
          if (body.stream === true) {
            sendResponsesStream(res, body, text, requestId);
            return;
          }
          return send(res, 200, responsesOutput(body, text));
        }

        return sendCompletionLogged(body, res, text, requestId, 'CODEX');
      }
    }

    const text = reply || 'Empty reply from ChatGPT Web.';

    if (apiType === 'responses') {
      if (body.stream === true) {
        sendResponsesStream(res, body, text, requestId);
        return;
      }
      return send(res, 200, responsesOutput(body, text));
    }

    return sendCompletionLogged(
      body,
      res,
      text,
      requestId,
      'CODEX'
    );
  } catch (err) {
    log('errors.log', `[${requestId}] Codex LLM error: ${err.message}\n${err.stack || ''}`);

    if (apiType === 'responses') {
      if (body.stream === true) {
        sendStreamError(res, body, err.message);
        return;
      }
      return send(res, 500, responsesOutput(body, 'ChatGPT Web backend error.'));
    }

    return sendCompletionLogged(
      body,
      res,
      'ChatGPT Web backend error.',
      requestId,
      'CODEX'
    );
  }
}

// ====== Responses API streaming helpers ======

function sendResponsesStream(res, body, text, requestId) {
  const id = `resp_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model || 'chatgpt-web';

  log('requests.log', `[${requestId}] [RESPONSES STREAM] start textLen=${text.length}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // response.created
  res.write(`data: ${JSON.stringify({
    type: 'response.created',
    response_id: id,
    created
  })}\n\n`);

  // response.in_progress
  res.write(`data: ${JSON.stringify({
    type: 'response.in_progress',
    response_id: id,
    created
  })}\n\n`);

  if (text) {
    // output_item.added (message)
    res.write(`data: ${JSON.stringify({
      type: 'response.output_item.added',
      response_id: id,
      created,
      output_index: 0,
      item: {
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: []
      }
    })}\n\n`);

    // content_part.added
    res.write(`data: ${JSON.stringify({
      type: 'response.content_part.added',
      response_id: id,
      created,
      output_index: 0,
      part_index: 0,
      part: {
        type: 'text'
      }
    })}\n\n`);

    // Stream the text word by word-ish
    if (text.length <= 100) {
      res.write(`data: ${JSON.stringify({
        type: 'response.output_text.delta',
        response_id: id,
        created,
        output_index: 0,
        part_index: 0,
        delta: text
      })}\n\n`);
    } else {
      // Send in chunks for long text
      for (let i = 0; i < text.length; i += 200) {
        const chunk = text.slice(i, i + 200);
        res.write(`data: ${JSON.stringify({
          type: 'response.output_text.delta',
          response_id: id,
          created,
          output_index: 0,
          part_index: 0,
          delta: chunk
      })}\n\n`);
      }
    }

    // response.output_text.done
    res.write(`data: ${JSON.stringify({
      type: 'response.output_text.done',
      response_id: id,
      created,
      output_index: 0,
      part_index: 0,
      text
    })}\n\n`);
  }

  // response.completed
  const output = text ? [{
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'output_text',
      text,
      annotations: []
    }]
  }] : [];

  res.write(`data: ${JSON.stringify({
    type: 'response.completed',
    response_id: id,
    created,
    response: {
      id,
      object: 'response',
      created,
      model,
      status: 'completed',
      output,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      }
    }
  })}\n\n`);

  res.write('data: [DONE]\n\n');
  res.end();

  log('requests.log', `[${requestId}] [RESPONSES STREAM] done`);
}

function sendResponsesStreamToolCall(res, body, toolCall, requestId) {
  const id = `resp_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model || 'chatgpt-web';
  const callId = toolCall.id || `call_${Date.now()}`;
  const args = typeof toolCall.arguments === 'string'
    ? toolCall.arguments
    : JSON.stringify(toolCall.arguments || {});

  log('requests.log', `[${requestId}] [RESPONSES STREAM TOOL] name=${toolCall.name}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // response.created
  res.write(`data: ${JSON.stringify({
    type: 'response.created',
    response_id: id,
    created
  })}\n\n`);

  // response.in_progress
  res.write(`data: ${JSON.stringify({
    type: 'response.in_progress',
    response_id: id,
    created
  })}\n\n`);

  // output_item.added (function_call)
  res.write(`data: ${JSON.stringify({
    type: 'response.output_item.added',
    response_id: id,
    created,
    output_index: 0,
    item: {
      id: callId,
      type: 'function_call',
      name: toolCall.name,
      arguments: ''
    }
  })}\n\n`);

  // function_call.arguments.delta
  res.write(`data: ${JSON.stringify({
    type: 'response.function_call_arguments.delta',
    response_id: id,
    created,
    output_index: 0,
    item_id: callId,
    delta: args
  })}\n\n`);

  // function_call.arguments.done
  res.write(`data: ${JSON.stringify({
    type: 'response.function_call_arguments.done',
    response_id: id,
    created,
    output_index: 0,
    item_id: callId,
    arguments: args
  })}\n\n`);

  // response.completed
  res.write(`data: ${JSON.stringify({
    type: 'response.completed',
    response_id: id,
    created,
    response: {
      id,
      object: 'response',
      created,
      model,
      status: 'completed',
      output: [{
        id: callId,
        type: 'function_call',
        name: toolCall.name,
        arguments: args,
        call_id: callId
      }],
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      }
    }
  })}\n\n`);

  res.write('data: [DONE]\n\n');
  res.end();

  log('requests.log', `[${requestId}] [RESPONSES STREAM TOOL] done`);
}

function sendStreamError(res, body, errMsg) {
  const id = `resp_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`data: ${JSON.stringify({
    type: 'response.failed',
    response_id: id,
    created,
    error: {
      type: 'server_error',
      message: errMsg || 'Internal error'
    }
  })}\n\n`);

  res.write('data: [DONE]\n\n');
  res.end();
}

module.exports = {
  handleCodexRequest
};
