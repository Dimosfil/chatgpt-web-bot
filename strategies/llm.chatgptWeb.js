const { chromium } = require('playwright');
const { CDP_URL, CHATGPT_URL, DEFAULT_TIMEOUT } = require('../config');
const { log } = require('../core/logger');
const { readReply } = require('./replyReader.chatgptDom');

class ChatGptWebStrategy {
  async generate(prompt) {
    prompt = String(prompt || '').trim();

    log('requests.log', `[PROMPT]\n${prompt}`);

    const browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error('No browser context found');
    }

    let page = context.pages().find(p => p.url().includes('chatgpt.com'));

    if (!page) {
      page = await context.newPage();
      await page.goto(CHATGPT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: DEFAULT_TIMEOUT
      });
      await page.waitForTimeout(2000);
    } else {
      try { await page.bringToFront(); } catch {}
    }

    await page.waitForSelector('#prompt-textarea', {
      state: 'visible',
      timeout: 20000
    });

    const msgBefore = await page
      .locator('[data-message-author-role="assistant"]')
      .count();

    const box = page.locator('#prompt-textarea').first();

    await box.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(prompt, { delay: 5 });
    await page.keyboard.press('Enter');

    const timeoutMs = parseInt(
      process.env.CHATGPT_WEB_TIMEOUT || '120000',
      10
    );

    const reply = await readReply(page, msgBefore, timeoutMs);

    try { await browser.close(); } catch {}

    if (!reply) {
      throw new Error('Empty reply from ChatGPT');
    }

    log('requests.log', `[REPLY]\n${reply}`);

    return reply;
  }
}

module.exports = {
  ChatGptWebStrategy
};