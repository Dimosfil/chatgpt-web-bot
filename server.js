const http = require('http');

const { log } = require('./core/logger');
const { send, readJsonBody } = require('./core/http');
const { completion, modelsList } = require('./core/openaiResponse');

const { buildPrompt } = require('./strategies/promptBuilder.cleanUserOnly');
const { handleSpecialRequest } = require('./strategies/specialRequests.openclaw');
const { ChatGptWebStrategy } = require('./strategies/llm.chatgptWeb');
const { optimizeOpenClawRequest } = require('./strategies/openclawOptimizer');

const PORT = parseInt(process.env.CHATGPT_WEB_PORT || '3999', 10);

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

function sendLogged(res, statusCode, payload) {
  writeBlock(
    'response.log',
    `SERVER -> OPENCLAW ${new Date().toISOString()}`,
    safeJson(payload)
  );

  return send(res, statusCode, payload);
}

const server = http.createServer(async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  log('requests.log', `[${requestId}] [REQ] ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    return sendLogged(res, 200, { ok: true });
  }

  if (req.method === 'GET' && req.url === '/v1/models') {
    return sendLogged(res, 200, modelsList());
  }

  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
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
        `[${requestId}] [PAYLOAD] model=${body.model || 'none'} messages=${body.messages?.length || 0} tools=${body.tools?.length || 0} stream=${body.stream} chars=${jsonSize(body)}`
      );
    } catch (err) {
      log('errors.log', `[${requestId}] Invalid JSON: ${err.message}`);

      return sendLogged(
        res,
        200,
        completion({}, 'Я не смог прочитать JSON запроса.')
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
      const responsePayload = completion(optimizedBody, specialReply);

      writeBlock(
        'response.log',
        `SPECIAL REPLY ${requestId}`,
        specialReply
      );

      return sendLogged(res, 200, responsePayload);
    }

    const prompt = buildPrompt(optimizedBody.messages || []);

    writeBlock(
      'prompt.log',
      `SERVER -> CHATGPT_WEB ${requestId}`,
      prompt || '[EMPTY PROMPT]'
    );

    log('requests.log', `[${requestId}] [PROMPT] chars=${prompt?.length || 0}`);

    if (!prompt || !prompt.trim()) {
      log('errors.log', `[${requestId}] Empty prompt after filtering`);

      return sendLogged(
        res,
        200,
        completion(optimizedBody, 'Я не получил текст запроса.')
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

      const responsePayload = completion(optimizedBody, reply || 'ChatGPT Web вернул пустой ответ.');

      return sendLogged(res, 200, responsePayload);
    } catch (err) {
      log('errors.log', `[${requestId}] LLM error: ${err.message}\n${err.stack || ''}`);

      return sendLogged(
        res,
        200,
        completion(
          optimizedBody,
          'Сервис временно не смог получить ответ от ChatGPT Web.'
        )
      );
    }
  }

  return sendLogged(res, 200, completion({}, 'ok'));
});

server.listen(PORT, () => {
  log('requests.log', `SERVER START http://127.0.0.1:${PORT}`);
});