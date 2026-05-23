const { log } = require('../core/logger');
const {
  isCodexOrchestratorRequest,
  planCodexOrchestration
} = require('../strategies/codexOrchestrator');
const { handleCodexFullFeature } = require('./handleCodexFullFeature');
const {
  handleDeepSeekChat,
  handleDeepSeekResponses
} = require('./handleDeepSeekGateway');

function shouldUseDeepSeekPlan(plan) {
  return plan?.backend === 'deepseek';
}

function shouldHandleCodexOrchestrator(body) {
  return isCodexOrchestratorRequest(body);
}

async function handleCodexOrchestrator(req, res, body, requestId, apiType, defaultBackend) {
  const orchestration = planCodexOrchestration(body, {
    apiType,
    defaultBackend
  });

  log(
    'requests.log',
    `[${requestId}] [CODEX ORCHESTRATOR] api=${apiType} backend=${orchestration.plan.backend} enabled=${orchestration.plan.orchestrated}`
  );

  if (shouldUseDeepSeekPlan(orchestration.plan)) {
    if (apiType === 'responses') {
      return handleDeepSeekResponses(req, res, orchestration.body, requestId);
    }
    return handleDeepSeekChat(req, res, orchestration.body, requestId);
  }

  return handleCodexFullFeature(req, res, orchestration.body, requestId, apiType);
}

module.exports = {
  handleCodexOrchestrator,
  shouldHandleCodexOrchestrator
};
