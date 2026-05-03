/**
 * КОНТЕКСТ: Полноценный handler для Codex.
 * Полностью отдельная логика — не влияет на OpenClaw.
 *
 * Поддерживает:
 * - POST /v1/responses (Codex с wire_api = "responses")
 * - POST /v1/chat/completions (Codex с input-массивом)
 * - stream: true (SSE)
 * - Tool calls через парсинг JSON из ответа ChatGPT
 * - Tool results — передача результатов выполнения обратно в контекст
 */

const { log } = require('../core/logger');
const { send } = require('../core/http');
const { ChatGptWebStrategy } = require('../strategies/llm.chatgptWeb');
const { buildCodexPrompt, extractToolHistory } = require('../strategies/codexPromptBuilder');
const { parseReply } = require('../strategies/codexToolParser');
const {
  safeJson,
  jsonSize,
  writeBlock,
  sendCompletionLogged,
  sendToolCallLogged
} = require('./responseHelpers');

const {
  responsesOutput,
  responsesOutputWithToolCall
} = require('../core/openaiResponse');

const llmStrategy = new ChatGptWebStrategy();

// ====== Responses API streaming helpers ======

function sendResponsesStream(res, body, text, requestId) {
  const id = `resp_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model || 'chatgpt-web';

  log('requests.log', `[${requestId}] [CODEX STREAM] textLen=${text.length}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // response.created
  res.write(`data: ${JSON.stringify({ type: 'response.created', response_id: id, created })}\n\n`);
  // response.in_progress
  res.write(`data: ${JSON.stringify({ type: 'response.in_progress', response_id: id, created })}\n\n`);

  if (text) {
    // output_item.added (message)
    res.write(`data: ${JSON.stringify({
      type: 'response.output_item.added',
      response_id: id, created,
      output_index: 0,
      item: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', content: [] }
    })}\n\n`);

    // content_part.added
    res.write(`data: ${JSON.stringify({
      type: 'response.content_part.added',
      response_id: id, created,
      output_index: 0, part_index: 0,
      part: { type: 'text' }
    })}\n\n`);

    // text delta (chunks)
    for (let i = 0; i < text.length; i += 200) {
      const chunk = text.slice(i, i + 200);
      res.write(`data: ${JSON.stringify({
        type: 'response.output_text.delta',
        response_id: id, created,
        output_index: 0, part_index: 0,
        delta: chunk
      })}\n\n`);
    }

    // text done
    res.write(`data: ${JSON.stringify({
      type: 'response.output_text.done',
      response_id: id, created,
      output_index: 0, part_index: 0,
      text
    })}\n\n`);
  }

  // response.completed
  const output = text ? [{
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text, annotations: [] }]
  }] : [];

  res.write(`data: ${JSON.stringify({
    type: 'response.completed',
    response_id: id, created,
    response: { id, object: 'response', created, model, status: 'completed', output, usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } }
  })}\n\n`);

  res.write('data: [DONE]\n\n');
  res.end();

  log('requests.log', `[${requestId}] [CODEX STREAM] done`);
}

function sendResponsesStreamToolCall(res, body, toolCall, requestId) {
  const id = `resp_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model || 'chatgpt-web';
  const callId = toolCall.id || `call_${Date.now()}`;
  const args = typeof toolCall.arguments === 'string' ? toolCall.arguments : JSON.stringify(toolCall.arguments || {});

  log('requests.log', `[${requestId}] [CODEX STREAM TOOL] name=${toolCall.name}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`data: ${JSON.stringify({ type: 'response.created', response_id: id, created })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'response.in_progress', response_id: id, created })}\n\n`);

  // output_item.added (function_call)
  res.write(`data: ${JSON.stringify({
    type: 'response.output_item.added',
    response_id: id, created,
    output_index: 0,
    item: { id: callId, type: 'function_call', name: toolCall.name, arguments: '' }
  })}\n\n`);

  // arguments delta
  res.write(`data: ${JSON.stringify({
    type: 'response.function_call_arguments.delta',
    response_id: id, created,
    output_index: 0, item_id: callId,
    delta: args
  })}\n\n`);

  // arguments done
  res.write(`data: ${JSON.stringify({
    type: 'response.function_call_arguments.done',
    response_id: id, created,
    output_index: 0, item_id: callId,
    arguments: args
  })}\n\n`);

  // response.completed
  res.write(`data: ${JSON.stringify({
    type: 'response.completed',
    response_id: id, created,
    response: {
      id, object: 'response', created, model, status: 'completed',
      output: [{
        id: callId, type: 'function_call', name: toolCall.name, arguments: args, call_id: callId
      }],
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
    }
  })}\n\n`);

  res.write('data: [DONE]\n\n');
  res.end();

  log('requests.log', `[${requestId}] [CODEX STREAM TOOL] done`);
}

function sendStreamError(res, errMsg) {
  const id = `resp_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`data: ${JSON.stringify({ type: 'response.failed', response_id: id, created, error: { type: 'server_error', message: errMsg || 'Internal error' } })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

/**
 * Основной handler для Codex-запросов.
 * @param {'chat'|'responses'} apiType
 */
async function handleCodexFullFeature(req, res, body, requestId, apiType = 'chat') {
  const prompt = buildCodexPrompt(body);

  writeBlock('prompt.log', `CODEX FULL -> CHATGPT_WEB ${requestId}`, prompt || '[EMPTY]');

  if (!prompt || !prompt.trim()) {
    log('errors.log', `[${requestId}] Codex empty prompt`);

    if (apiType === 'responses') {
      if (body.stream === true) {
        sendResponsesStream(res, body, 'Empty prompt.', requestId);
        return;
      }
      send(res, 200, responsesOutput(body, 'Empty prompt.'));
      return;
    }

    sendCompletionLogged(body, res, 'Empty prompt.', requestId, 'CODEX');
    return;
  }

  try {
    const startedAt = Date.now();
    log('requests.log', `[${requestId}] [CODEX LLM] start apiType=${apiType}`);

    const reply = await llmStrategy.generate(prompt);

    writeBlock('response.log', `CHATGPT_WEB -> CODEX FULL ${requestId}`, reply || '[EMPTY]');

    log('requests.log', `[${requestId}] [CODEX LLM] ok durationMs=${Date.now() - startedAt} replyChars=${reply?.length || 0}`);

    const hasTools = (body.tools && body.tools.length > 0) || (body.functions && body.functions.length > 0);

    if (hasTools) {
      const parsed = parseReply(reply);

      if (parsed.type === 'tool_call') {
        log('requests.log', `[${requestId}] [CODEX TOOL] name=${parsed.toolCall.name}`);

        if (apiType === 'responses') {
          if (body.stream === true) {
            sendResponsesStreamToolCall(res, body, parsed.toolCall, requestId);
            return;
          }
          send(res, 200, responsesOutputWithToolCall(body, parsed.toolCall));
          return;
        }

        sendToolCallLogged(body, res, parsed.toolCall, requestId, 'CODEX');
        return;
      }
    }

    const text = reply || 'Empty reply from ChatGPT Web.';

    if (apiType === 'responses') {
      if (body.stream === true) {
        sendResponsesStream(res, body, text, requestId);
        return;
      }
      send(res, 200, responsesOutput(body, text));
      return;
    }

    sendCompletionLogged(body, res, text, requestId, 'CODEX');
  } catch (err) {
    log('errors.log', `[${requestId}] Codex LLM error: ${err.message}\n${err.stack || ''}`);

    if (apiType === 'responses') {
      if (body.stream === true) {
        sendStreamError(res, err.message);
        return;
      }
      send(res, 500, responsesOutput(body, 'ChatGPT Web backend error.'));
      return;
    }

    sendCompletionLogged(body, res, 'ChatGPT Web backend error.', requestId, 'CODEX');
  }
}

module.exports = { handleCodexFullFeature };
