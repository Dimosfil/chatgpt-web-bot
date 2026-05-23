const assert = require('assert');
const {
  ORCHESTRATOR_MARKER,
  isCodexOrchestratorRequest,
  planCodexOrchestration,
  requestedBackend
} = require('../strategies/codexOrchestrator');
const { buildDeepSeekChatRequest } = require('../strategies/deepseekRequestBuilder');
const { buildCodexPrompt } = require('../strategies/codexPromptBuilder');

const body = {
  model: 'codex-orchestrator',
  input: 'Update the server and run checks.',
  tools: [{
    type: 'function',
    function: {
      name: 'shell_command',
      parameters: { type: 'object', properties: { command: { type: 'string' } } }
    }
  }]
};

assert.strictEqual(requestedBackend({ model: 'deepseek/deepseek-v4-pro' }, 'chatgpt_web'), 'deepseek');
assert.strictEqual(requestedBackend({ model: 'chatgpt-web' }, 'deepseek'), 'chatgpt_web');
assert.strictEqual(isCodexOrchestratorRequest({ model: 'gpt-5.4', input: 'hello' }), false);
assert.strictEqual(isCodexOrchestratorRequest(body), true);

const regular = planCodexOrchestration({ model: 'gpt-5.4', input: 'hello' }, {
  apiType: 'responses',
  defaultBackend: 'deepseek'
});

assert.strictEqual(regular.plan.orchestrated, false);
assert.strictEqual(regular.body.instructions, undefined);

const orchestration = planCodexOrchestration(body, {
  apiType: 'responses',
  defaultBackend: 'deepseek'
});

assert.strictEqual(orchestration.plan.backend, 'deepseek');
assert.strictEqual(orchestration.plan.orchestrated, true);
assert.match(orchestration.body.instructions, /\[chatgpt-web-bot codex orchestrator\]/);
assert.strictEqual(orchestration.body.input, body.input);
assert.strictEqual(orchestration.body.metadata.codex_orchestrator.backend, 'deepseek');

const repeated = planCodexOrchestration(orchestration.body, {
  apiType: 'responses',
  defaultBackend: 'deepseek'
});
assert.strictEqual(
  repeated.body.instructions.indexOf(ORCHESTRATOR_MARKER),
  repeated.body.instructions.lastIndexOf(ORCHESTRATOR_MARKER)
);

const deepSeekPayload = buildDeepSeekChatRequest(orchestration.body, { stream: false });
assert.strictEqual(deepSeekPayload.messages[0].role, 'system');
assert.match(deepSeekPayload.messages[0].content, /Codex orchestration layer/);
assert.strictEqual(deepSeekPayload.messages[1].role, 'user');

const prompt = buildCodexPrompt(orchestration.body);
assert.match(prompt, /## System instructions/);
assert.match(prompt, /Codex orchestration layer/);
assert.match(prompt, /Update the server and run checks/);

console.log('codex orchestrator ok');
