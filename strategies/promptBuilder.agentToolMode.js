const fs = require('fs');
const path = require('path');

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
  return fs.readFileSync(filePath, 'utf8').trim();
}

function buildAgentPrompt(body) {
  const basePath = path.join(__dirname, 'prompts');

  const rules = readFileSafe(path.join(basePath, 'openclawAgentRules.txt'));
  const examples = readFileSafe(path.join(basePath, 'openclawAgentExamples.txt'));

  return [
    rules,
    '',
    examples,
    '',
    'Текущий intent оптимизатора:',
    safeJson(body._optimizer || {}),
    '',
    'Доступные tools после фильтрации:',
    safeJson(simplifyTools(body.tools || [])),
    '',
    'История сообщений:',
    safeJson(body.messages || [])
  ].join('\n');
}

module.exports = {
  buildAgentPrompt
};