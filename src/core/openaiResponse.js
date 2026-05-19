function completion(body, text) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body?.model || 'chatgpt-web',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: text || 'ok'
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

function completionWithToolCall(body, toolCall) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body?.model || 'chatgpt-web',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: toolCall.id || `call_${Date.now()}`,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments || {})
          }
        }]
      },
      finish_reason: 'tool_calls'
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

function modelsList() {
  const now = Math.floor(Date.now() / 1000);
  const models = [
    {
      id: 'chatgpt-web',
      object: 'model',
      created: now,
      owned_by: 'chatgpt-web-bot'
    },
    {
      id: 'custom_cursor',
      object: 'model',
      created: now,
      owned_by: 'cursor'
    },
    {
      id: 'gpt-5.4',
      object: 'model',
      created: now,
      owned_by: 'openai'
    },
    {
      id: 'gpt-5.4-mini',
      object: 'model',
      created: now,
      owned_by: 'openai'
    },
    {
      id: 'gpt-4o',
      object: 'model',
      created: now,
      owned_by: 'openai'
    }
  ];

  if (process.env.DEEPSEEK_API_KEY || process.env.CHATGPT_WEB_BACKEND === 'deepseek') {
    models.push({
      id: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      object: 'model',
      created: now,
      owned_by: 'deepseek'
    });
  }

  return {
    object: 'list',
    data: models
  };
}

function responsesOutput(reqBody, text) {
  return {
    id: `resp_${Date.now()}`,
    object: 'response',
    created: Math.floor(Date.now() / 1000),
    model: reqBody?.model || 'chatgpt-web',
    status: 'completed',
    output: [{
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'output_text',
        text: text || ''
      }]
    }],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0
    }
  };
}

function responsesOutputWithToolCall(reqBody, toolCall) {
  const args = typeof toolCall.arguments === 'string'
    ? toolCall.arguments
    : JSON.stringify(toolCall.arguments || {});

  return {
    id: `resp_${Date.now()}`,
    object: 'response',
    created: Math.floor(Date.now() / 1000),
    model: reqBody?.model || 'chatgpt-web',
    status: 'completed',
    output: [{
      type: 'function_call',
      id: toolCall.id || `call_${Date.now()}`,
      call_id: toolCall.id || `call_${Date.now()}`,
      name: toolCall.name,
      arguments: args
    }],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0
    }
  };
}

module.exports = {
  completion,
  completionWithToolCall,
  responsesOutput,
  responsesOutputWithToolCall,
  modelsList
};
