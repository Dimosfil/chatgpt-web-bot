const fs = require('fs');
const path = require('path');

const MAX_PROMPT_MESSAGES = parseInt(
  process.env.OPENCLAW_PROMPT_MAX_MESSAGES || '6',
  10
);

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function simplifyTools(tools) {
  return (tools || [])
    .filter(t => t && t.type === 'function' && t.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {}
    }));
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function buildAgentPrompt(body) {
  const basePath = path.join(__dirname, 'prompts');

  const rules = readFileSafe(path.join(basePath, 'openclawAgentRules.txt'));
  const examples = readFileSafe(path.join(basePath, 'openclawAgentExamples.txt'));

  const messages = (body.messages || []).slice(-MAX_PROMPT_MESSAGES);
  const tools = simplifyTools(body.tools || []);

  return [
    rules,
    '',
    examples,
    '',
    'Текущий intent оптимизатора:',
    safeJson(body._optimizer || {}),
    '',
    'Доступные tools после фильтрации:',
    safeJson(tools),
    '',
    'ВНИМАНИЕ: если tools пустой — нельзя использовать tool_call. В этом случае верни только final.',
    '',
    'История сообщений:',
    safeJson(messages)
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  buildAgentPrompt
};