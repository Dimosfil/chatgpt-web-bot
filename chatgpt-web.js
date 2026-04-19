const { chromium } = require('playwright');

const CHATGPT_URL = 'https://chatgpt.com/';
const USER_DATA_DIR = './pw-profile'; // сохраняет сессию между запусками
const PROMPT = process.argv.slice(2).join(' ') || 'Привет! Ответь одной короткой фразой.';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForManualLogin(page) {
  console.log('\n[1/5] Открываю ChatGPT...');
  await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded' });

  console.log('[2/5] Если нужно — войди в аккаунт вручную.');
  console.log('      После входа открой любой чат или оставайся на главной странице.');
  console.log('      Я подожду, пока появится поле ввода.\n');

  // Ждём наиболее вероятные варианты поля ввода
  const composer = page.locator([
    'textarea',
    '[contenteditable="true"]',
    'div[role="textbox"]',
    '[data-testid*="composer"]',
    '[placeholder*="Message"]',
    '[placeholder*="Сообщение"]',
    '[placeholder*="Спросите"]',
  ].join(', ')).first();

  await composer.waitFor({ timeout: 10 * 60 * 1000 }); // до 10 минут на ручной логин
  console.log('[OK] Поле ввода найдено.');
  return composer;
}

async function fillComposer(page, composer, text) {
  console.log('[3/5] Вставляю промпт...');

  // Иногда textarea, иногда contenteditable
  const tagName = await composer.evaluate((el) => el.tagName.toLowerCase());

  if (tagName === 'textarea') {
    await composer.click();
    await composer.fill(text);
    return;
  }

  await composer.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await page.keyboard.insertText(text);
}

async function sendMessage(page, composer) {
  console.log('[4/5] Отправляю сообщение...');

  // Иногда Enter отправляет, иногда нет. Сначала пробуем Enter.
  await composer.press('Enter').catch(() => {});

  // Небольшая пауза: если не ушло, попробуем найти кнопку отправки
  await sleep(1500);

  // Пытаемся найти кнопку отправки по нескольким селекторам
  const sendButton = page.locator([
    'button[aria-label*="Send"]',
    'button[aria-label*="Отправ"]',
    'button[data-testid*="send"]',
    'button:has(svg)',
  ].join(', ')).filter({ hasNotText: 'Stop' }).last();

  // Если поле всё ещё содержит текст и кнопка видна — жмём кнопку
  const stillVisible = await composer.isVisible().catch(() => false);
  if (stillVisible) {
    try {
      if (await sendButton.isVisible({ timeout: 1500 })) {
        await sendButton.click();
      }
    } catch {
      // ignore
    }
  }
}

async function waitForResponse(page) {
  console.log('[5/5] Жду ответ модели...');

  // Ждём, пока появится хотя бы один блок ответа ассистента
  // Селекторы максимально "живучие", но интерфейс может меняться
  const candidateSelectors = [
    '[data-message-author-role="assistant"]',
    'article',
    '.markdown',
    '[class*="markdown"]',
  ];

  const startedAt = Date.now();
  const timeoutMs = 2 * 60 * 1000;

  let bestText = '';

  while (Date.now() - startedAt < timeoutMs) {
    for (const sel of candidateSelectors) {
      const blocks = page.locator(sel);
      const count = await blocks.count().catch(() => 0);

      if (count > 0) {
        // Берём последний блок
        const last = blocks.nth(count - 1);
        const txt = (await last.innerText().catch(() => '')).trim();

        // Отбрасываем слишком короткие / пустые значения
        if (txt.length > bestText.length) {
          bestText = txt;
        }
      }
    }

    // Признак, что генерация уже закончилась:
    // нет кнопки Stop / есть достаточно длинный текст
    const stopBtn = page.locator('button[aria-label*="Stop"], button:has-text("Stop")').first();
    const stopVisible = await stopBtn.isVisible().catch(() => false);

    if (bestText.length > 20 && !stopVisible) {
      return bestText;
    }

    await sleep(1200);
  }

  if (bestText) return bestText;
  throw new Error('Не удалось надежно получить ответ. Возможно, поменялась верстка сайта.');
}

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    const composer = await waitForManualLogin(page);
    await fillComposer(page, composer, PROMPT);
    await sendMessage(page, composer);

    const answer = await waitForResponse(page);

    console.log('\n===== ANSWER START =====\n');
    console.log(answer);
    console.log('\n===== ANSWER END =====\n');
  } catch (err) {
    console.error('\n[ERROR]', err.message);
  }

  // Не закрываем браузер специально:
  // так сессия и куки сохраняются в ./pw-profile
  // await context.close();
})();