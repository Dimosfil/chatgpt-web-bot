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

function modelsList() {
  return {
    object: 'list',
    data: [{
      id: 'chatgpt-web',
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'chatgpt-web-bot'
    }]
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
          id: `call_${Date.now()}`,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments || {})
          }
        }]
      },
      finish_reason: 'tool_calls'
    }]
  };
}

module.exports = {
  completion,
  modelsList
};