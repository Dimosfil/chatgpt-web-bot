const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://chatgpt.com/', {
    waitUntil: 'commit',
    timeout: 120000,
  });

  await page.waitForTimeout(3000);

  const composer = page.locator('textarea, [contenteditable="true"], div[role="textbox"]').first();
  await composer.waitFor({ timeout: 600000 });

  await composer.click();
  await page.keyboard.insertText('Привет! Ответь одной фразой.');

  await composer.press('Enter').catch(() => {});
})();