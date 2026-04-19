const { chromium } = require('playwright');

const PROMPT =
  process.argv.slice(2).join(' ') || 'Привет! Ответь одной короткой фразой.';

const PROJECT_NAME = 'Чаты LLM-gateway';

function ts() {
  return Date.now();
}

function logStep(start, label) {
  const ms = Date.now() - start;
  console.log(`[${(ms / 1000).toFixed(2)}s] ${label}`);
}

function logInfo(label) {
  console.log(`[INFO] ${label}`);
}

async function getChatGPTPage(context) {
  let page = context.pages().find((p) => p.url().includes('chatgpt.com'));

  if (!page) {
    page = await context.newPage();
    await page.goto('https://chatgpt.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForTimeout(1500);
  } else {
    try {
      await page.bringToFront();
    } catch {}
  }

  if (!page.url().includes('chatgpt.com')) {
    await page.goto('https://chatgpt.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForTimeout(1500);
  }

  return page;
}

async function ensureSidebarVisible(page) {
  const sidebarSelectors = [
    'nav',
    'aside',
    '[data-testid*="sidebar"]',
    '[class*="sidebar"]',
  ];

  for (const sel of sidebarSelectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 300 })) return true;
    } catch {}
  }

  const toggleSelectors = [
    'button[aria-label*="sidebar" i]',
    'button[aria-label*="menu" i]',
    'button[aria-label*="бок" i]',
    'button[data-testid*="sidebar"]',
  ];

  for (const sel of toggleSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(800);
        break;
      }
    } catch {}
  }

  for (const sel of sidebarSelectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 500 })) return true;
    } catch {}
  }

  return false;
}

async function openProjectFolder(page, projectName = PROJECT_NAME) {
  await ensureSidebarVisible(page);

  const tryFindAndClick = async () => {
    const candidates = [
      page.getByText(projectName, { exact: true }).first(),
      page.locator(`text="${projectName}"`).first(),
      page.locator(`a:has-text("${projectName}")`).first(),
      page.locator(`button:has-text("${projectName}")`).first(),
      page.locator(`[role="treeitem"]:has-text("${projectName}")`).first(),
      page.locator(`[role="link"]:has-text("${projectName}")`).first(),
      page.locator(`[data-testid*="project"]:has-text("${projectName}")`).first(),
    ];

    for (const loc of candidates) {
      try {
        if (await loc.isVisible({ timeout: 500 })) {
          await loc.click().catch(() => {});
          await page.waitForTimeout(1200);
          return true;
        }
      } catch {}
    }
    return false;
  };

  if (await tryFindAndClick()) return true;

  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 700).catch(() => {});
    await page.waitForTimeout(250);

    if (await tryFindAndClick()) return true;
  }

  return false;
}

async function findComposer(page) {
  const selectors = [
    'textarea',
    '[contenteditable="true"]',
    'div[role="textbox"]',
    '[data-testid*="composer"]',
  ];

  const started = Date.now();
  const timeoutMs = 15000;

  while (Date.now() - started < timeoutMs) {
    for (const sel of selectors) {
      const locator = page.locator(sel).first();
      try {
        if (await locator.isVisible({ timeout: 250 })) {
          return locator;
        }
      } catch {}
    }
    await page.waitForTimeout(200);
  }

  throw new Error('Не нашёл поле ввода ChatGPT.');
}

async function waitForComposerReady(page, timeoutMs = 15000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const composer = await findComposer(page);
      const visible = await composer.isVisible().catch(() => false);
      if (visible) return composer;
    } catch {}

    await page.waitForTimeout(250);
  }

  throw new Error('После создания нового чата поле ввода не появилось.');
}

async function createNewChat(page) {
  logInfo('Пробую создать новый чат');

  await page.bringToFront().catch(() => {});

  const composerBefore = await page.locator('textarea, [contenteditable="true"], div[role="textbox"]').count().catch(() => 0);
  logInfo(`Полей ввода до создания чата: ${composerBefore}`);

  // Вариант 1: горячая клавиша нового чата — самый стабильный
  try {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+Shift+o`).catch(() => {});
    await page.waitForTimeout(1200);

    const composer = await waitForComposerReady(page, 6000).catch(() => null);
    if (composer) {
      logInfo('Новый чат создан через горячую клавишу');
      return true;
    }
  } catch {}

  // Вариант 2: кнопки "новый чат"
  const selectors = [
    'button[aria-label*="New chat" i]',
    'button[aria-label*="Новый чат" i]',
    'a[aria-label*="New chat" i]',
    'a[aria-label*="Новый чат" i]',
    'button[data-testid*="new-chat"]',
    'a[data-testid*="new-chat"]',
    'button:has-text("New chat")',
    'button:has-text("Новый чат")',
    'a:has-text("New chat")',
    'a:has-text("Новый чат")',
    'button[title*="New chat" i]',
    'button[title*="Новый чат" i]',
  ];

  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 500 })) {
        logInfo(`Нашёл кнопку нового чата: ${sel}`);
        await el.click().catch(() => {});
        await page.waitForTimeout(1200);

        const composer = await waitForComposerReady(page, 6000).catch(() => null);
        if (composer) {
          logInfo('Новый чат создан через кнопку');
          return true;
        }
      }
    } catch {}
  }

  // Вариант 3: открыть главную и дождаться нового composer
  logInfo('Пробую открыть главную страницу ChatGPT');
  await page.goto('https://chatgpt.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(1800);

  const composer = await waitForComposerReady(page, 10000).catch(() => null);
  if (composer) {
    logInfo('Новый чат создан через переход на главную');
    return true;
  }

  throw new Error('Не удалось создать новый чат.');
}

async function fillComposer(page, composer, text) {
  const tagName = await composer
    .evaluate((el) => el.tagName.toLowerCase())
    .catch(() => '');

  await composer.click().catch(() => {});

  if (tagName === 'textarea') {
    await composer.fill('').catch(() => {});
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
  await page.waitForTimeout(250);

  const sendSelectors = [
    'button[aria-label*="Send" i]',
    'button[aria-label*="Отправ" i]',
    'button[data-testid*="send"]',
  ];

  for (const sel of sendSelectors) {
    const btn = page.locator(sel).first();
    try {
      if (await btn.isVisible({ timeout: 200 })) {
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
      const index = Math.max(previousCount, count - 1);
      const last = page.locator(selector).nth(index);
      const text = (await last.innerText().catch(() => '')).trim();

      if (text.length > 0) {
        bestText = text;

        if (text !== lastSeenText) {
          lastSeenText = text;
          unchangedForMs = 0;
        } else {
          unchangedForMs += pollMs;
        }

        if (count > previousCount && unchangedForMs >= stableMsToFinish) {
          return {
            text: bestText,
            time: Date.now() - started,
            selector,
          };
        }

        if (previousCount === 0 && unchangedForMs >= stableMsToFinish) {
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
    const openedProject = await openProjectFolder(page, PROJECT_NAME);
    logStep(
      t3,
      openedProject
        ? `Открыл проект "${PROJECT_NAME}"`
        : `Проект "${PROJECT_NAME}" не найден, продолжаю без него`
    );

    const t4 = ts();
    await createNewChat(page);
    logStep(t4, 'Создал новый чат');

    const t5 = ts();
    const assistantInfo = await getAssistantCount(page);
    const previousCount = assistantInfo.count;
    logStep(t5, `Снял baseline сообщений (${previousCount})`);

    const t6 = ts();
    const composer = await findComposer(page);
    logStep(t6, 'Нашёл поле ввода');

    const t7 = ts();
    await fillComposer(page, composer, PROMPT);
    logStep(t7, 'Промпт вставлен');

    const t8 = ts();
    await sendMessage(page, composer);
    logStep(t8, 'Сообщение отправлено');

    const t9 = ts();
    const reply = await waitForAssistantReply(page, previousCount);
    logStep(
      t9,
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