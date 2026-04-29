require('dotenv').config();
const http = require('http');

const { log } = require('./core/logger');
const { send, readJsonBody } = require('./core/http');
const {
  completion,
  completionWithToolCall,
  modelsList
} = require('./core/openaiResponse');

const { buildPrompt } = require('./strategies/promptBuilder.cleanUserOnly');
const { buildAgentPrompt } = require('./strategies/promptBuilder.agentToolMode');
const { handleSpecialRequest } = require('./strategies/specialRequests.openclaw');
const { ChatGptWebStrategy } = require('./strategies/llm.chatgptWeb');
const { optimizeOpenClawRequest } = require('./strategies/openclawOptimizer');
const { tryParseAgentReply } = require('./strategies/toolParser');

const PORT = parseInt(process.env.CHATGPT_WEB_PORT || '3999', 10);
const AGENT_MODE = process.env.CHATGPT_WEB_AGENT_MODE === '1';

const llmStrategy = new ChatGptWebStrategy();

process.on('uncaughtException', err => {
  log('errors.log', `UNCAUGHT: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', reason => {
  log(
    'errors.log',
    `UNHANDLED: ${reason instanceof Error ? reason.stack : String(reason)}`
  );
});

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

function makeCompletionPayload(reqBody, text) {
  return completion(reqBody, text);
}

function sendToolCallLogged(reqBody, res, toolCall, requestId) {
  const wantsStream = reqBody.stream === true;

  if (!wantsStream) {
    const payload = completionWithToolCall(reqBody, toolCall);

    writeBlock(
      'response.log',
      `SERVER -> OPENCLAW TOOL_CALL JSON ${requestId}`,
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
    `SERVER -> OPENCLAW TOOL_CALL STREAM ${requestId}`,
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

function sendCompletionLogged(reqBody, res, text, requestId) {
  const wantsStream = reqBody.stream === true;

  if (!wantsStream) {
    const payload = makeCompletionPayload(reqBody, text);

    writeBlock(
      'response.log',
      `SERVER -> OPENCLAW JSON ${requestId}`,
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
    `SERVER -> OPENCLAW STREAM ${requestId}`,
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

function sendSimpleLogged(res, statusCode, payload, requestId) {
  writeBlock(
    'response.log',
    `SERVER -> OPENCLAW SIMPLE ${requestId}`,
    safeJson(payload)
  );

  return send(res, statusCode, payload);
}

const server = http.createServer(async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  log('requests.log', `[${requestId}] [REQ] ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    return sendSimpleLogged(res, 200, { ok: true }, requestId);
  }

  if (req.method === 'GET' && req.url === '/v1/models') {
    return sendSimpleLogged(res, 200, modelsList(), requestId);
  }

  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    return sendSimpleLogged(res, 200, completion({}, 'ok'), requestId);
  }

  let body = {};

  try {
    body = await readJsonBody(req);

    writeBlock(
      'payload.log',
      `OPENCLAW -> SERVER ${requestId}`,
      safeJson(body)
    );

    log(
      'requests.log',
      `[${requestId}] [PAYLOAD] model=${body.model || 'none'} messages=${body.messages?.length || 0} tools=${body.tools?.length || 0} stream=${body.stream} chars=${jsonSize(body)} agentMode=${AGENT_MODE}`
    );
  } catch (err) {
    log('errors.log', `[${requestId}] Invalid JSON: ${err.message}`);

    return sendCompletionLogged(
      body,
      res,
      'Я не смог прочитать JSON запроса.',
      requestId
    );
  }

  const optimizedBody = optimizeOpenClawRequest(body);

  writeBlock(
    'optimized.log',
    `SERVER OPTIMIZED ${requestId}`,
    safeJson(optimizedBody)
  );

  log(
    'requests.log',
    `[${requestId}] [SIZE] original=${jsonSize(body)} optimized=${jsonSize(optimizedBody)} saved=${jsonSize(body) - jsonSize(optimizedBody)}`
  );

  const specialReply = handleSpecialRequest(optimizedBody);

  if (specialReply) {
    writeBlock(
      'response.log',
      `SPECIAL REPLY ${requestId}`,
      specialReply
    );

    return sendCompletionLogged(body, res, specialReply, requestId);
  }

  const prompt = AGENT_MODE
    ? buildAgentPrompt(optimizedBody)
    : buildPrompt(optimizedBody.messages || []);

  writeBlock(
    'prompt.log',
    `SERVER -> CHATGPT_WEB ${requestId}`,
    prompt || '[EMPTY PROMPT]'
  );

  log('requests.log', `[${requestId}] [PROMPT] chars=${prompt?.length || 0}`);

  if (!prompt || !prompt.trim()) {
    log('errors.log', `[${requestId}] Empty prompt after filtering`);

    return sendCompletionLogged(
      body,
      res,
      'Я не получил текст запроса.',
      requestId
    );
  }

  try {
    const startedAt = Date.now();

    log('requests.log', `[${requestId}] [LLM] start`);

    const reply = await llmStrategy.generate(prompt);

    writeBlock(
      'response.log',
      `CHATGPT_WEB -> SERVER ${requestId}`,
      reply || '[EMPTY REPLY]'
    );

    log(
      'requests.log',
      `[${requestId}] [LLM] ok durationMs=${Date.now() - startedAt} replyChars=${reply?.length || 0}`
    );

    const parsed = AGENT_MODE ? tryParseAgentReply(reply) : null;

    if (parsed) {
      writeBlock(
        'response.log',
        `AGENT PARSED ${requestId}`,
        safeJson(parsed)
      );

      if (parsed.type === 'tool_call') {
        return sendToolCallLogged(body, res, parsed.toolCall, requestId);
      }

      if (parsed.type === 'final') {
        return sendCompletionLogged(
          body,
          res,
          parsed.text || 'Готово.',
          requestId
        );
      }
    }

    return sendCompletionLogged(
      body,
      res,
      reply || 'ChatGPT Web вернул пустой ответ.',
      requestId
    );
  } catch (err) {
    log('errors.log', `[${requestId}] LLM error: ${err.message}\n${err.stack || ''}`);

    return sendCompletionLogged(
      body,
      res,
      'Сервис временно не смог получить ответ от ChatGPT Web.',
      requestId
    );
  }
});

server.listen(PORT, () => {
  log('requests.log', `SERVER START http://127.0.0.1:${PORT}`);
});