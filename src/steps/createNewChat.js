const { CHATGPT_URL, DEFAULT_TIMEOUT } = require('../config');
const { logInfo } = require('../utils');
const { findComposer } = require('./findComposer');

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

    const composerBefore = await page
        .locator('textarea, [contenteditable="true"], div[role="textbox"]')
        .count()
        .catch(() => 0);

    logInfo(`Полей ввода до создания чата: ${composerBefore}`);

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

    logInfo('Пробую открыть главную страницу ChatGPT');
    await page.goto(CHATGPT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: DEFAULT_TIMEOUT,
    });
    await page.waitForTimeout(1800);

    const composer = await waitForComposerReady(page, 10000).catch(() => null);
    if (composer) {
        logInfo('Новый чат создан через переход на главную');
        return true;
    }

    throw new Error('Не удалось создать новый чат.');
}

module.exports = { createNewChat };