const { log } = require('../core/logger');
const { buildPrompt } = require('../strategies/promptBuilder.cleanUserOnly');
const { ChatGptWebStrategy } = require('../strategies/llm.chatgptWeb');

const {
  writeBlock,
  sendCompletionLogged
} = require('./responseHelpers');

const llmStrategy = new ChatGptWebStrategy();

async function handleDefaultRequest(req, res, body, requestId) {
  const prompt = buildPrompt(body.messages || []);

  writeBlock(
    'prompt.log',
    `DEFAULT -> CHATGPT_WEB ${requestId}`,
    prompt || '[EMPTY PROMPT]'
  );

  if (!prompt || !prompt.trim()) {
    log('errors.log', `[${requestId}] Default empty prompt`);

    return sendCompletionLogged(
      body,
      res,
      'Я не получил текст запроса.',
      requestId,
      'DEFAULT'
    );
  }

  try {
    const reply = await llmStrategy.generate(prompt);

    writeBlock(
      'response.log',
      `CHATGPT_WEB -> DEFAULT SERVER ${requestId}`,
      reply || '[EMPTY REPLY]'
    );

    return sendCompletionLogged(
      body,
      res,
      reply || 'ChatGPT Web вернул пустой ответ.',
      requestId,
      'DEFAULT'
    );
  } catch (err) {
    log('errors.log', `[${requestId}] Default LLM error: ${err.message}\n${err.stack || ''}`);

    return sendCompletionLogged(
      body,
      res,
      'Сервис временно не смог получить ответ от ChatGPT Web.',
      requestId,
      'DEFAULT'
    );
  }
}

module.exports = {
  handleDefaultRequest
};