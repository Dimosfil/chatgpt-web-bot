const { chromium } = require('playwright');
const { CDP_URL, CHATGPT_URL, DEFAULT_TIMEOUT } = require('../config');

// Прямая копия runChatGPTConversation из server.js
async function runChatGPTConversation(prompt) {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  if (!context) throw new Error('No context');

  let page = context.pages().find(p => p.url().includes('chatgpt.com'));
  if (!page) {
    console.log('  Opening new ChatGPT page...');
    page = await context.newPage();
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);
  } else {
    try { await page.bringToFront(); } catch {}
  }
  page.setDefaultTimeout(DEFAULT_TIMEOUT);
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);

  console.log('  Waiting for #prompt-textarea...');
  await page.waitForSelector('#prompt-textarea', { state: 'visible', timeout: 15000 });
  const composer = page.locator('#prompt-textarea').first();

  console.log('  Clicking composer...');
  await composer.click();
  await page.waitForTimeout(300);

  console.log('  Filling text...');
  await composer.fill(prompt);
  await page.waitForTimeout(300);

  console.log('  Counting current messages...');
  const msgBefore = await page.locator('[data-message-author-role="assistant"]').count();
  console.log(`  Messages before: ${msgBefore}`);

  console.log('  Pressing Enter...');
  await page.keyboard.press('Enter');

  console.log('  Waiting for new assistant response...');
  const started = Date.now();
  let lastText = '';
  while (Date.now() - started < 60000) {
    const count = await page.locator('[data-message-author-role="assistant"]').count();
    if (count > msgBefore) {
      lastText = await page.locator('[data-message-author-role="assistant"]').last().textContent();
      if (lastText && lastText.length > 5) break;
    }
    await page.waitForTimeout(500);
  }

  await browser.close();

  if (!lastText) throw new Error('No reply from ChatGPT (timeout)');
  return lastText;
}

(async () => {
  try {
    console.log('Testing runChatGPTConversation...');
    const result = await runChatGPTConversation('Say hello in 3 words');
    console.log('RESULT:', JSON.stringify(result));
  } catch(e) {
    console.log('FAIL:', e.message || e);
  }
  process.exit(0);
})();
