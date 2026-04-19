const { chromium } = require('playwright');

const PROMPT =
  process.argv.slice(2).join(' ') || 'Привет! Ответь одной короткой фразой.';

function ts() {
  return Date.now();
}

function logStep(start, label) {
  const ms = Date.now() - start;
  console.log(`[${(ms / 1000).toFixed(2)}s] ${label}`);
}

async function getChatGPTPage(context) {
  let page = context.pages().find((p) => p.url().includes('chatgpt.com'));

  if (!page) {
    page = await context.newPage();
    await page.goto('https://chatgpt.com/', {
      waitUntil: 'commit',
      timeout: 120000,
    });
    await page.waitForTimeout(1200);
  }

  return page;
}

async function findComposer(page) {
  const selectors = [
    'textarea',
    '[contenteditable="true"]',
    'div[role="textbox"]',
    '[data-testid*="composer"]',
  ];

  const started = Date.now();
  const timeoutMs = 10000;

  while (Date.now() - started < timeoutMs) {
    for (const sel of selectors) {
      const locator = page.locator(sel).first();
      try {
        if (await locator.isVisible({ timeout: 200 })) {
          return locator;
        }
      } catch {}
    }
    await page.waitForTimeout(150);
  }

  throw new Error('Не нашёл поле ввода ChatGPT.');
}

async function fillComposer(page, composer, text) {
  const tagName = await composer
    .evaluate((el) => el.tagName.toLowerCase())
    .catch(() => '');

  await composer.click();

  if (tagName === 'textarea') {
    await composer.fill('');
    await composer.fill(text);
    return;
  }

  await page.keyboard
    .press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    .catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await page.keyboard.insertText(text);
}

async function sendMessage(page, composer) {
  await composer.press('Enter').catch(() => {});
  await page.waitForTimeout(200);

  const sendSelectors = [
    'button[aria-label*="Send"]',
    'button[aria-label*="Отправ"]',
    'button[data-testid*="send"]',
  ];

  for (const sel of sendSelectors) {
    const btn = page.locator(sel).first();
    try {
      if (await btn.isVisible({ timeout: 150 })) {
        await btn.click().catch(() => {});
        return;
      }
    } catch {}
  }
}

async function getAssistantCount(page) {
  const selectors = [
    '[data-message-author-role="assistant"]',
    'article',
    '.markdown',
    '[class*="markdown"]',
  ];

  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count();
      if (count > 0) return { sel, count };
    } catch {}
  }

  return { sel: '[data-message-author-role="assistant"]', count: 0 };
}

async function waitForAssistantReply(page, previousCount = 0) {
  const started = Date.now();
  const timeoutMs = 120000;
  const pollMs = 250;
  const stableMsToFinish = 1800;

  let bestText = '';
  let lastSeenText = '';
  let unchangedForMs = 0;

  while (Date.now() - started < timeoutMs) {
    const info = await getAssistantCount(page);
    const selector = info.sel;
    const count = info.count;

    if (count > 0) {
      const last = page.locator(selector).nth(count - 1);
      const text = (await last.innerText().catch(() => '')).trim();

      if (text.length > 0) {
        bestText = text;

        // Если это новый ответ или текст последнего ответа начал меняться
        if (text !== lastSeenText) {
          lastSeenText = text;
          unchangedForMs = 0;
        } else {
          unchangedForMs += pollMs;
        }

        // Если текст стабилен достаточно долго — считаем ответ завершённым
        // И не важно, вырос count или нет
        if (unchangedForMs >= stableMsToFinish) {
          return {
            text: bestText,
            time: Date.now() - started,
            selector,
          };
        }
      }
    }

    await page.waitForTimeout(pollMs);
  }

  if (bestText) {
    return {
      text: bestText,
      time: Date.now() - started,
      selector: 'fallback',
    };
  }

  throw new Error('Не дождался ответа ассистента.');
}

(async () => {
  const globalStart = ts();

  try {
    const t1 = ts();
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    if (!context) throw new Error('Не найден context в подключённом Chrome.');
    logStep(t1, 'Подключился к Chrome');

    const t2 = ts();
    const page = await getChatGPTPage(context);
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);
    logStep(t2, 'Нашёл/открыл ChatGPT');

    const t3 = ts();
    const assistantInfo = await getAssistantCount(page);
    const previousCount = assistantInfo.count;
    logStep(t3, `Снял baseline сообщений (${previousCount})`);

    const t4 = ts();
    const composer = await findComposer(page);
    logStep(t4, 'Нашёл поле ввода');

    const t5 = ts();
    await fillComposer(page, composer, PROMPT);
    logStep(t5, 'Промпт вставлен');

    const t6 = ts();
    await sendMessage(page, composer);
    logStep(t6, 'Сообщение отправлено');

    const t7 = ts();
    const reply = await waitForAssistantReply(page, previousCount);
    logStep(
      t7,
      `Получен ответ (${(reply.time / 1000).toFixed(2)}s генерация, ${reply.selector})`
    );

    console.log('\n===== ANSWER START =====\n');
    console.log(reply.text);
    console.log('\n===== ANSWER END =====\n');

    console.log(`\n⏱️ Общее время: ${((Date.now() - globalStart) / 1000).toFixed(2)}s`);
  } catch (err) {
    console.error('\n[ERROR]', err.message);
  }
})();