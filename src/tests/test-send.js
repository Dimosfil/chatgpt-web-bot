const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctx = browser.contexts()[0];

    let page = ctx.pages().find(p => p.url().includes('chatgpt.com'));
    if (!page) {
      page = await ctx.newPage();
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    }
    await page.bringToFront();

    console.log('1. Typing into composer...');
    const composer = page.locator('#prompt-textarea').first();
    await composer.click();
    await page.waitForTimeout(300);
    await composer.fill('Say hello in 3 words');
    await page.waitForTimeout(500);
    console.log('   Text entered');

    console.log('2. Pressing Enter...');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    console.log('   Enter pressed');

    console.log('3. Waiting for response...');
    // Wait for any message to start appearing
    const startTime = Date.now();
    let lastAssistantText = '';
    while (Date.now() - startTime < 30000) {
      const assistants = page.locator('[data-message-author-role="assistant"]');
      const count = await assistants.count().catch(() => 0);
      if (count > 0) {
        const lastText = await assistants.last().textContent().catch(() => '');
        if (lastText && lastText.length > 5) {
          lastAssistantText = lastText;
          break;
        }
      }
      await page.waitForTimeout(500);
    }
    
    if (lastAssistantText) {
      console.log('   Response:', JSON.stringify(lastAssistantText).slice(0, 300));
    } else {
      console.log('   No response within 30s');
      // Dump page state
      console.log('   Page title:', await page.title().catch(() => '?'));
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200)).catch(() => '?');
      console.log('   Page text:', JSON.stringify(bodyText));
    }

    await browser.close();
  } catch (e) {
    console.log('FAIL:', e.message || e);
  }
  process.exit(0);
})();
