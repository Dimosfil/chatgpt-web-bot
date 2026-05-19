const assert = require('assert');
const { buildCursorRequest } = require('../strategies/cursorRequestBuilder');

const payload = buildCursorRequest({
  model: 'custom_cursor',
  messages: [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'Use the calculator.' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call_calc_1',
        type: 'function',
        function: {
          name: 'calculator',
          arguments: '{"expression":"2+2"}'
        }
      }]
    },
    {
      role: 'tool',
      tool_call_id: 'call_calc_1',
      content: '4'
    },
    { role: 'user', content: 'Now answer.' }
  ],
  tools: [{
    type: 'function',
    function: {
      name: 'calculator',
      parameters: {
        properties: {
          expression: { type: 'string' }
        },
        required: ['expression']
      }
    }
  }],
  tool_choice: 'auto'
});

assert.strictEqual(payload.stream, false);
assert.strictEqual(payload.messages.length, 5);
assert.strictEqual(payload.messages[2].role, 'assistant');
assert.strictEqual(payload.messages[2].tool_calls[0].id, 'call_calc_1');
assert.strictEqual(payload.messages[3].role, 'tool');
assert.strictEqual(payload.messages[3].tool_call_id, 'call_calc_1');
assert.strictEqual(payload.tools[0].function.parameters.type, 'object');
assert.strictEqual(payload.tool_choice, 'auto');

const legacyPayload = buildCursorRequest({
  model: 'custom_cursor',
  messages: [
    { role: 'user', content: 'Use legacy function.' },
    {
      role: 'assistant',
      function_call: {
        name: 'lookup',
        arguments: { query: 'abc' }
      }
    },
    {
      role: 'function',
      name: 'lookup',
      content: 'result'
    }
  ],
  functions: [{
    name: 'lookup',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      }
    }
  }]
});

assert.strictEqual(legacyPayload.messages.length, 3);
assert.strictEqual(legacyPayload.messages[1].tool_calls[0].function.name, 'lookup');
assert.strictEqual(legacyPayload.messages[2].role, 'tool');
assert.strictEqual(legacyPayload.messages[2].tool_call_id, legacyPayload.messages[1].tool_calls[0].id);
assert.strictEqual(legacyPayload.tools[0].function.name, 'lookup');

console.log('cursor builder ok');
