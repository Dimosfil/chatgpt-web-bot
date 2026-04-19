const { chromium } = require('playwright');

const PROMPT = process.argv.slice(2).join(' ') || 'Привет! Ответь одной короткой фразой.';

function now() {
  return Date.now();
}

function logStep(start, label) {
  const ms = Date.now() - start;
  console.log(`[${(ms / 1000).toFixed(2)}s] ${label}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getChatGPTPage(context) {
  let page = context.pages().find(p => p.url().includes('chatgpt.com'));

  if (!page) {
    page = await context.newPage();
    await page.goto('https://chatgpt.com/', {
      waitUntil: 'commit',
      timeout: 120000,
    });
    await page.waitForTimeout(5000);
  }

  return page;
}

async function findComposer(page) {
  const selectors = [
    'textarea',
    '[contenteditable="true"]',
    'div[role="textbox"]',
    '[data-testid*="composer"]'
  ];

  for (const sel of selectors) {
    const locator = page.locator(sel).first();
    try {
      await locator.waitFor({ timeout: 5000 });
      return locator;
    } catch {}
  }

  throw new Error('Не нашёл поле ввода ChatGPT.');
}

async function fillComposer(page, composer, text) {
  const tagName = await composer.evaluate(el => el.tagName.toLowerCase()).catch(() => '');

  await composer.click();

  if (tagName === 'textarea') {
    await composer.fill('');
    await composer.fill(text);
  } else {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await page.keyboard.insertText(text);
  }
}

async function sendMessage(page, composer) {
  await composer.press('Enter').catch(() => {});
  await sleep(1500);

  const sendButton = page.locator([
    'button[aria-label*="Send"]',
    'button[aria-label*="Отправ"]',
    'button[data-testid*="send"]'
  ].join(', ')).first();

  try {
    if (await sendButton.isVisible({ timeout: 2000 })) {
      await sendButton.click();
    }
  } catch {}
}

async function waitForAssistantReply(page, previousCount) {
  const assistant = page.locator('[data-message-author-role="assistant"]');

  const start = now();

  while (now() - start < 120000) {
    const count = await assistant.count().catch(() => 0);

    if (count > previousCount) {
      const last = assistant.nth(count - 1);

      let bestText = '';
      let stableRounds = 0;

      for (let i = 0; i < 20; i++) {
        const text = (await last.innerText().catch(() => '')).trim();

        if (text && text === bestText) {
          stableRounds++;
        } else if (text.length >= bestText.length) {
          bestText = text;
          stableRounds = 0;
        }

        if (bestText.length > 10 && stableRounds >= 2) {
          return { text: bestText, time: now() - start };
        }

        await sleep(1500);
      }

      if (bestText) {
        return { text: bestText, time: now() - start };
      }
    }

    await sleep(1000);
  }

  throw new Error('Не дождался ответа ассистента.');
}

(async () => {
  const globalStart = now();

  try {
    const t1 = now();
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    logStep(t1, 'Подключился к Chrome');

    const t2 = now();
    const page = await getChatGPTPage(context);
    logStep(t2, 'Нашёл/открыл ChatGPT');

    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    const assistant = page.locator('[data-message-author-role="assistant"]');
    const previousCount = await assistant.count().catch(() => 0);

    const t3 = now();
    const composer = await findComposer(page);
    logStep(t3, 'Нашёл поле ввода');

    const t4 = now();
    await fillComposer(page, composer, PROMPT);
    logStep(t4, 'Промпт вставлен');

    const t5 = now();
    await sendMessage(page, composer);
    logStep(t5, 'Сообщение отправлено');

    const t6 = now();
    const reply = await waitForAssistantReply(page, previousCount);
    logStep(t6, `Получен ответ (${(reply.time / 1000).toFixed(2)}s генерация)`);

    console.log('\n===== ANSWER START =====\n');
    console.log(reply.text);
    console.log('\n===== ANSWER END =====\n');

    console.log(`\n⏱️ Общее время: ${((now() - globalStart) / 1000).toFixed(2)}s`);
  } catch (err) {
    console.error('\n[ERROR]', err.message);
  }
})();