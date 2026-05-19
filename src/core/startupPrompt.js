function shouldPromptForDeepSeekKey() {
  if ((process.env.DEEPSEEK_API_KEY || '').trim()) return false;
  if (process.env.CHATGPT_WEB_PROMPT_DEEPSEEK_KEY === '0') return false;

  const backend = (process.env.CHATGPT_WEB_BACKEND || '').toLowerCase();
  const defaultClient = (process.env.CHATGPT_WEB_DEFAULT_CLIENT || '').toLowerCase();
  const model = (process.env.DEEPSEEK_MODEL || '').toLowerCase();

  return backend === 'deepseek'
    || defaultClient === 'cursor'
    || model.startsWith('deepseek');
}

function promptHidden(question) {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.resolve('');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = stdin.isRaw;

    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    }

    function finish() {
      cleanup();
      stdout.write('\n');
      resolve(value);
    }

    function onData(chunk) {
      const text = chunk.toString('utf8');

      if (text === '\u0003') {
        cleanup();
        stdout.write('\n');
        reject(new Error('Startup cancelled.'));
        return;
      }

      if (text === '\r' || text === '\n' || text === '\r\n') {
        finish();
        return;
      }

      if (text === '\b' || text === '\u007f') {
        if (value.length) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }

      value += text;
      stdout.write('*'.repeat([...text].length));
    }

    stdout.write(question);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.on('data', onData);
  });
}

async function promptForDeepSeekKeyIfNeeded() {
  if (!shouldPromptForDeepSeekKey()) return;

  const key = (await promptHidden('DeepSeek API key is empty. Enter key for this server session: ')).trim();
  if (key) {
    process.env.DEEPSEEK_API_KEY = key;
    console.log('DeepSeek API key loaded for this server session.');
  } else {
    console.warn('DeepSeek API key was not entered. DeepSeek requests will fail until DEEPSEEK_API_KEY is set.');
  }
}

module.exports = {
  promptForDeepSeekKeyIfNeeded,
  shouldPromptForDeepSeekKey
};
