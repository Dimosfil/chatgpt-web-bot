require('dotenv').config();
const http = require('http');

const { log } = require('./core/logger');
const { installGlobalErrorHandlers } = require('./core/errorHandler');
const { createRequestHandler } = require('./handlers/router');

installGlobalErrorHandlers();

const PORT = parseInt(process.env.CHATGPT_WEB_PORT || '3999', 10);
const server = http.createServer(createRequestHandler());

server.listen(PORT, () => {
  log('requests.log', `SERVER START http://127.0.0.1:${PORT}`);
  console.log(`chatgpt-web-bot running on http://127.0.0.1:${PORT}`);
});
