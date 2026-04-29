const { log } = require('./logger');

function installGlobalErrorHandlers() {
  process.on('uncaughtException', err => {
    log('errors.log', `UNCAUGHT: ${err.message}\n${err.stack}`);
  });

  process.on('unhandledRejection', reason => {
    log(
      'errors.log',
      `UNHANDLED: ${reason instanceof Error ? reason.stack : String(reason)}`
    );
  });
}

module.exports = { installGlobalErrorHandlers };
