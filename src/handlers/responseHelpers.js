const { log } = require('../core/logger');
const { send } = require('../core/http');
const {
  completion,
  completionWithToolCall
} = require('../core/openaiResponse');

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (err) {
    return `[JSON stringify error] ${err.message}`;
  }
}

function jsonSize(obj) {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}

function writeBlock(file, title, content) {
  log(file, `\n\n================ ${title} ================`);
  log(file, content);
  log(file, `================ END ${title} ================\n`);
}

function sendSimpleLogged(res, statusCode, payload, requestId) {
  writeBlock(
    'response.log',
    `SERVER -> SIMPLE ${requestId}`,
    safeJson(payload)
  );

  return send(res, statusCode, payload);
}

function sendCompletionLogged(reqBody, res, text, requestId, label = 'SERVER') {
  const wantsStream = reqBody.stream === true;

  if (!wantsStream) {
    const payload = completion(reqBody, text);

    writeBlock(
      'response.log',
      `${label} -> CLIENT JSON ${requestId}`,
      safeJson(payload)
    );

    return send(res, 200, payload);
  }

  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = reqBody.model || 'chatgpt-web';

  const chunks = [
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: { role: 'assistant' },
        finish_reason: null
      }]
    },
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: { content: text },
        finish_reason: null
      }]
    },
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop'
      }]
    }
  ];

  writeBlock(
    'response.log',
    `${label} -> CLIENT STREAM ${requestId}`,
    chunks.map(chunk => `data: ${JSON.stringify(chunk)}`).join('\n\n') +
      '\n\ndata: [DONE]\n\n'
  );

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

function sendToolCallLogged(reqBody, res, toolCall, requestId, label = 'SERVER') {
  const wantsStream = reqBody.stream === true;

  if (!wantsStream) {
    const payload = completionWithToolCall(reqBody, toolCall);

    writeBlock(
      'response.log',
      `${label} -> CLIENT TOOL_CALL JSON ${requestId}`,
      safeJson(payload)
    );

    return send(res, 200, payload);
  }

  const id = `chatcmpl-${Date.now()}`;
  const callId = toolCall.id || `call_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = reqBody.model || 'chatgpt-web';

  const args =
    typeof toolCall.arguments === 'string'
      ? toolCall.arguments
      : JSON.stringify(toolCall.arguments || {});

  const chunks = [
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: callId,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: args
            }
          }]
        },
        finish_reason: null
      }]
    },
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'tool_calls'
      }]
    }
  ];

  writeBlock(
    'response.log',
    `${label} -> CLIENT TOOL_CALL STREAM ${requestId}`,
    chunks.map(chunk => `data: ${JSON.stringify(chunk)}`).join('\n\n') +
      '\n\ndata: [DONE]\n\n'
  );

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

module.exports = {
  safeJson,
  jsonSize,
  writeBlock,
  sendSimpleLogged,
  sendCompletionLogged,
  sendToolCallLogged
};