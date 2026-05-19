const assert = require('assert');
const {
  buildDeepSeekChatRequest,
  hasInlineImages,
  normalizeTools
} = require('../strategies/deepseekRequestBuilder');

const imageBody = {
  model: 'deepseek/deepseek-v4-pro',
  input: [{
    type: 'message',
    role: 'user',
    content: [
      { type: 'input_text', text: 'What is in this image?' },
      { type: 'input_image', image_url: 'data:image/png;base64,abc123' }
    ]
  }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'view_image',
        parameters: { type: 'object', properties: { path: { type: 'string' } } }
      }
    },
    {
      type: 'function',
      function: {
        name: 'shell_command',
        parameters: { type: 'object', properties: { command: { type: 'string' } } }
      }
    }
  ]
};

assert.strictEqual(hasInlineImages(imageBody), true);

const payload = buildDeepSeekChatRequest(imageBody, { stream: false });
assert.strictEqual(payload.stream, false);
assert.strictEqual(payload.messages[0].role, 'system');
assert.match(payload.messages[0].content, /inline image data/);
assert.match(payload.messages[1].content, /What is in this image/);
assert.match(payload.messages[1].content, /Inline image omitted/);
assert.strictEqual(payload.tools, undefined);

const tools = normalizeTools([{ name: 'view_image' }, { name: 'shell_command' }], {
  omitNames: ['view_image']
});
assert.deepStrictEqual(tools.map(tool => tool.function.name), ['shell_command']);

console.log('deepseek builder ok');
