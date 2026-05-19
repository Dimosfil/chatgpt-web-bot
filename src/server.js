require('dotenv').config();
const http = require('http');

const { log } = require('./core/logger');
const { installGlobalErrorHandlers } = require('./core/errorHandler');
const { promptForDeepSeekKeyIfNeeded } = require('./core/startupPrompt');

installGlobalErrorHandlers();

async function main() {
  await promptForDeepSeekKeyIfNeeded();

  const { createRequestHandler } = require('./handlers/router');
  const PORT = parseInt(process.env.CHATGPT_WEB_PORT || '3999', 10);
  const server = http.createServer(createRequestHandler());

  server.listen(PORT, () => {
    log('requests.log', `SERVER START http://127.0.0.1:${PORT}`);
    console.log(`chatgpt-web-bot running on http://127.0.0.1:${PORT}`);
  });
}

main().catch((err) => {
  log('errors.log', `SERVER START FAILED ${err.stack || err.message}`);
  console.error(err.stack || err.message);
  process.exit(1);
});
