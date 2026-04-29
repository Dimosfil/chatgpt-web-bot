const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, '..', 'debug');
try { fs.mkdirSync(DEBUG_DIR, { recursive: true }); } catch {}

function log(file, msg) {
  try {
    fs.appendFileSync(
      path.join(DEBUG_DIR, file),
      `[${new Date().toISOString()}] ${msg}\n`,
      'utf8'
    );
  } catch {}
}

module.exports = { log };