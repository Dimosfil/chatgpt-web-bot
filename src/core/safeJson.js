const { log } = require('./logger');

function safeJson(obj) {
  try {
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'string' && value.startsWith('data:image/')) {
        const commaIndex = value.indexOf(',');
        const meta = commaIndex >= 0 ? value.slice(0, commaIndex) : 'data:image';
        return `${meta},[base64 redacted length=${value.length}]`;
      }
      return value;
    }, 2);
  } catch (err) {
    return `[JSON stringify error] ${err.message}`;
  }
}

function jsonSize(obj) {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}

function writeBlock(file, title, content) {
  log(file, `\n\n================ ${title} ================`);
  log(file, content);
  log(file, `================ END ${title} ================\n`);
}

module.exports = { safeJson, jsonSize, writeBlock };
