const { hasInlineImages } = require('./deepseekRequestBuilder');

const ORCHESTRATOR_MARKER = '[chatgpt-web-bot codex orchestrator]';
const ORCHESTRATOR_MODEL = 'codex-orchestrator';
const CHATGPT_WEB_MODELS = new Set([
  'chatgpt-web',
  'codex-chatgpt-web'
]);

function normalizeBackend(value) {
  const backend = String(value || '').trim().toLowerCase();
  if (backend === 'deepseek') return 'deepseek';
  if (backend === 'chatgpt_web' || backend === 'chatgpt-web' || backend === 'chatgpt') {
    return 'chatgpt_web';
  }
  return '';
}

function requestedBackend(body, defaultBackend) {
  const explicit =
    normalizeBackend(body?.metadata?.backend) ||
    normalizeBackend(body?.backend) ||
    normalizeBackend(defaultBackend);

  const model = String(body?.model || '').trim().toLowerCase();
  if (model.startsWith('deepseek/')) return 'deepseek';
  if (CHATGPT_WEB_MODELS.has(model)) return 'chatgpt_web';

  return explicit || 'chatgpt_web';
}

function isCodexOrchestratorRequest(body) {
  const model = String(body?.model || '').trim().toLowerCase();

  if (model === ORCHESTRATOR_MODEL || model.startsWith(`${ORCHESTRATOR_MODEL}/`)) {
    return true;
  }

  if (body?.metadata?.codex_orchestrator === true) return true;
  if (body?.metadata?.codex_orchestrator?.enabled === true) return true;
  if (body?.codex_orchestrator === true) return true;

  return process.env.CHATGPT_WEB_CODEX_ORCHESTRATOR === '1';
}

function hasTools(body) {
  return (Array.isArray(body?.tools) && body.tools.length > 0) ||
    (Array.isArray(body?.functions) && body.functions.length > 0);
}

function buildOrchestratorInstructions(body, plan) {
  const apiType = plan.apiType || 'chat';
  const backend = plan.backend || 'chatgpt_web';
  const toolMode = hasTools(body) ? 'tools_available' : 'no_tools';
  const imageMode = hasInlineImages(body) ? 'inline_images_present' : 'text_only';

  return [
    ORCHESTRATOR_MARKER,
    'You are the Codex orchestration layer for the local chatgpt-web-bot project.',
    'Project shape: an Express-compatible OpenAI API wrapper on port 3999 routes Codex, OpenClaw, Cursor, ChatGPT Web, and DeepSeek gateway requests.',
    `Current route: api=${apiType}; backend=${backend}; tool_mode=${toolMode}; input_mode=${imageMode}.`,
    'Operate as a project-aware coding agent: preserve user changes, keep edits scoped, prefer existing project patterns, and use available tools when the task requires filesystem reads, edits, commands, tests, or diagnostics.',
    'For tool-capable requests, decide whether a tool call is needed before answering. If a tool call is needed, emit exactly one native/function tool call through the client protocol. If no tool is needed, answer directly.',
    'For implementation work, gather local context first, then edit, verify with the fastest relevant checks, and report changed files and checks run.',
    'Do not invent external project state. Treat .env, logs, debug output, credentials, browser profiles, and generated archives as sensitive unless the user explicitly asks for them.'
  ].join('\n');
}

function appendInstructions(existing, addition) {
  const current = String(existing || '').trim();
  if (current.includes(ORCHESTRATOR_MARKER)) return current;
  if (!current) return addition;
  return `${current}\n\n${addition}`;
}

function planCodexOrchestration(body, options = {}) {
  const backend = requestedBackend(body, options.defaultBackend);
  const plan = {
    apiType: options.apiType || 'chat',
    backend,
    orchestrated: isCodexOrchestratorRequest(body),
    reason: 'codex_project_orchestrator'
  };

  if (!plan.orchestrated) {
    return { plan, body };
  }

  const nextBody = {
    ...body,
    instructions: appendInstructions(
      body?.instructions,
      buildOrchestratorInstructions(body, plan)
    ),
    metadata: {
      ...(body?.metadata || {}),
      codex_orchestrator: {
        enabled: true,
        backend: plan.backend,
        api_type: plan.apiType,
        reason: plan.reason
      }
    }
  };

  return { plan, body: nextBody };
}

module.exports = {
  ORCHESTRATOR_MARKER,
  ORCHESTRATOR_MODEL,
  buildOrchestratorInstructions,
  isCodexOrchestratorRequest,
  planCodexOrchestration,
  requestedBackend
};
