const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "openclaw_js_test.log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function log(data) {
  const line =
    "\n==============================\n" +
    `[${now()}]\n` +
    data +
    "\n";

  fs.appendFileSync(LOG_FILE, line, "utf8");
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";

    process.stdin.setEncoding("utf8");

    process.stdin.on("data", chunk => {
      data += chunk;
    });

    process.stdin.on("end", () => {
      resolve(data.trim());
    });

    setTimeout(() => {
      resolve(data.trim());
    }, 300);
  });
}

(async () => {
  const args = process.argv.slice(2);
  const stdin = await readStdin();

  let parsedStdin = null;

  try {
    parsedStdin = stdin ? JSON.parse(stdin) : null;
  } catch {
    parsedStdin = null;
  }

  const payload = {
    time: now(),
    cwd: process.cwd(),
    script: __filename,
    args,
    stdinRaw: stdin,
    stdinJson: parsedStdin,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      USERNAME: process.env.USERNAME,
      OPENCLAW: process.env.OPENCLAW
    }
  };

  log(JSON.stringify(payload, null, 2));

  const userText =
    args.join(" ") ||
    parsedStdin?.message ||
    parsedStdin?.text ||
    parsedStdin?.content ||
    stdin ||
    "";

  const response = {
    ok: true,
    source: "telegram -> openclaw -> js -> logs",
    receivedText: userText,
    logFile: LOG_FILE,
    answer: `JS скрипт получил сообщение: "${userText}"`
  };

  console.log(JSON.stringify(response, null, 2));
})();