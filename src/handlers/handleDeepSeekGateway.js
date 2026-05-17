const { send } = require('../core/http');
const { responsesOutput, responsesOutputWithToolCall } = require('../core/openaiResponse');
const { safeJson, writeBlock } = require('../core/safeJson');
const { DeepSeekStrategy } = require('../strategies/llm.deepseek');
const { buildDeepSeekChatRequest } = require('../strategies/deepseekRequestBuilder');

const deepSeek = new DeepSeekStrategy();

function firstChoice(payload) {
  return payload?.choices?.[0] || {};
}

function toolCallFromChoice(choice) {
  const call = choice?.message?.tool_calls?.[0];
  if (!call) return null;
  return {
    id: call.id,
    name: call.function?.name,
    arguments: call.function?.arguments || '{}'
  };
}

function textFromChoice(choice) {
  return choice?.message?.content || '';
}

function sendResponsesStream(res, body, text, requestId) {
  const id = `resp_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const messageId = `msg_${Date.now()}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`data: ${JSON.stringify({ type: 'response.created', response_id: id, created })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'response.in_progress', response_id: id, created })}\n\n`);

  if (text) {
    res.write(`data: ${JSON.stringify({
      type: 'response.output_item.added',
      response_id: id,
      created,
      output_index: 0,
      item: { id: messageId, type: 'message', role: 'assistant', content: [] }
    })}\n\n`);

    res.write(`data: ${JSON.stringify({
      type: 'response.content_part.added',
      response_id: id,
      created,
      output_index: 0,
      part_index: 0,
      part: { type: 'text' }
    })}\n\n`);

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

    res.write(`data: ${JSON.stringify({
      type: 'response.output_text.done',
      response_id: id,
      created,
      output_index: 0,
      part_index: 0,
      text
    })}\n\n`);
  }

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
      output: text ? [{
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }]
      }] : [],
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
    }
  })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

function sendResponsesStreamToolCall(res, body, toolCall, requestId) {
  const id = `resp_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const callId = toolCall.id || `call_${Date.now()}`;
  const args = typeof toolCall.arguments === 'string'
    ? toolCall.arguments
    : JSON.stringify(toolCall.arguments || {});

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`data: ${JSON.stringify({ type: 'response.created', response_id: id, created })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'response.in_progress', response_id: id, created })}\n\n`);
  res.write(`data: ${JSON.stringify({
    type: 'response.output_item.added',
    response_id: id,
    created,
    output_index: 0,
    item: {
      id: callId,
      type: 'function_call',
      call_id: callId,
      name: toolCall.name,
      arguments: '',
      status: 'in_progress'
    }
  })}\n\n`);
  res.write(`data: ${JSON.stringify({
    type: 'response.function_call_arguments.delta',
    response_id: id,
    created,
    output_index: 0,
    item_id: callId,
    delta: args
  })}\n\n`);
  res.write(`data: ${JSON.stringify({
    type: 'response.function_call_arguments.done',
    response_id: id,
    created,
    output_index: 0,
    item_id: callId,
    arguments: args
  })}\n\n`);
  res.write(`data: ${JSON.stringify({
    type: 'response.output_item.done',
    response_id: id,
    created,
    output_index: 0,
    item: {
      id: callId,
      type: 'function_call',
      call_id: callId,
      name: toolCall.name,
      arguments: args,
      status: 'completed'
    }
  })}\n\n`);
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
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
    }
  })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

function sendResponsesStreamError(res, message) {
  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
  }

  res.write(`data: ${JSON.stringify({
    type: 'response.failed',
    error: { message }
  })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

async function handleDeepSeekChat(req, res, body, requestId) {
  const payload = buildDeepSeekChatRequest(body);

  if (!payload.messages.length) {
    return send(res, 400, { error: { message: 'messages/input cannot be empty' } });
  }

  if (body.stream === true) {
    await deepSeek.streamToResponse(payload, res, requestId);
    return;
  }

  const upstream = await deepSeek.chatCompletion(payload, requestId);
  writeBlock('response.log', `DEEPSEEK -> CLIENT CHAT ${requestId}`, safeJson(upstream));
  return send(res, 200, upstream);
}

async function handleDeepSeekResponses(req, res, body, requestId) {
  try {
    const payload = buildDeepSeekChatRequest(body, { stream: false });

    if (!payload.messages.length) {
      return send(res, 400, { error: { message: 'input cannot be empty' } });
    }

    const upstream = await deepSeek.chatCompletion(payload, requestId);
    const choice = firstChoice(upstream);
    const toolCall = toolCallFromChoice(choice);

    writeBlock('response.log', `DEEPSEEK -> CLIENT RESPONSES ${requestId}`, safeJson(upstream));

    if (toolCall) {
      if (body.stream === true) {
        sendResponsesStreamToolCall(res, body, toolCall, requestId);
        return;
      }
      return send(res, 200, responsesOutputWithToolCall(body, toolCall));
    }

    const text = textFromChoice(choice);
    if (body.stream === true) {
      sendResponsesStream(res, body, text, requestId);
      return;
    }
    return send(res, 200, responsesOutput(body, text));
  } catch (err) {
    if (body.stream === true) {
      sendResponsesStreamError(res, err.message || 'DeepSeek request failed');
      return;
    }
    return send(res, 500, responsesOutput(body, err.message || 'DeepSeek request failed'));
  }
}

module.exports = {
  handleDeepSeekChat,
  handleDeepSeekResponses
};
