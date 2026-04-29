const { chromium } = require('playwright');
const { CDP_URL, CHATGPT_URL, DEFAULT_TIMEOUT } = require('../config');

(async () => {
  try {
    console.log('1. Connecting to Chrome CDP...');
    const browser = await chromium.connectOverCDP(CDP_URL);
    const ctx = browser.contexts()[0];
    console.log('OK');

    console.log('2. Finding ChatGPT page...');
    let page = ctx.pages().find(p => p.url().includes('chatgpt.com'));
    if (!page) {
      console.log('   Opening new page...');
      page = await ctx.newPage();
      await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    }
    await page.bringToFront();
    console.log('   URL:', page.url().slice(0, 120));

    console.log('3. Looking for composer (#prompt-textarea)...');
    const composer = page.locator('#prompt-textarea').first();
    const visible = await composer.isVisible().catch(() => false);
    console.log('   Visible:', visible);

    console.log('4. Filling prompt...');
    await composer.click();
    await composer.fill('Say hello in 3 words');
    console.log('   Filled');

    console.log('5. Looking for send button...');
    // Try to find and click send button
    const sendBtn = page.locator('button[data-testid="send-button"], button:has(svg), [aria-label="Send"]').first();
    const sendVisible = await sendBtn.isVisible().catch(() => false);
    console.log('   Send button visible:', sendVisible);
    
    if (sendVisible) {
      await sendBtn.click();
    } else {
      // Try pressing Enter
      await page.keyboard.press('Enter');
    }
    console.log('   Sent');

    console.log('6. Waiting for response...');
    // Wait for new message from assistant
    await page.waitForTimeout(3000);
    
    const assistants = page.locator('[data-message-author-role="assistant"], .markdown, article');
    const count = await assistants.count().catch(() => 0);
    console.log('   Assistant messages found:', count);
    
    if (count > 0) {
      const lastText = await assistants.last().textContent().catch(() => '(no text)');
      console.log('   Last text:', JSON.stringify(lastText).slice(0, 200));
    }

    await browser.close();
    console.log('DONE');
  } catch (e) {
    console.log('FAIL:', e.message || e);
  }
  process.exit(0);
})();
