const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const pages = browser.contexts()[0]?.pages();
  if (!pages || pages.length === 0) { console.log('NO PAGES'); await browser.close(); return; }
  
  // Сначала откроем новый чат на chatgpt.com (не GPT)
  const page = pages.find(p => p.url().includes('chatgpt.com')) || pages[0];
  await page.bringToFront();
  
  // Проверим, можно ли перейти на стандартный ChatGPT
  console.log('Current URL:', page.url());
  
  // Откроем новую вкладку с чистым ChatGPT
  const newPage = await browser.contexts()[0].newPage();
  await newPage.goto('https://chatgpt.com/?model=gpt-4o', { waitUntil: 'networkidle', timeout: 30000 });
  await newPage.waitForTimeout(3000);
  
  console.log('New page URL:', newPage.url());
  console.log('Title:', await newPage.title());
  
  // Проверим наличие композера
  const composer = await newPage.evaluate(() => {
    const textarea = document.querySelector('textarea, [contenteditable="true"], [class*="composer"], [class*="prompt"]');
    return {
      hasTextarea: textarea !== null,
      tag: textarea?.tagName,
      attr: textarea?.getAttribute('class')?.substring(0, 100),
      bodyPreview: document.body.innerText.substring(0, 500),
      hasDalle: document.body.innerText.includes('DALL-E') || document.body.innerText.includes('DALL·E')
    };
  });
  console.log('Composer:', JSON.stringify(composer, null, 2));
  
  if (composer.hasTextarea) {
    // Отправим запрос на генерацию изображения
    const result = await newPage.evaluate(async () => {
      const textarea = document.querySelector('textarea, [contenteditable="true"]');
      if (!textarea) return 'no textarea';
      textarea.value = 'Нарисуй рыжего кота на подоконнике, цифровой рисунок';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Ждем появления кнопки отправки и кликаем
      await new Promise(r => setTimeout(r, 1000));
      const sendBtn = document.querySelector('button[data-testid="send-button"], button[class*="send"], button:has(svg)');
      if (sendBtn) { sendBtn.click(); }
      else { 
        // Try Enter key
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, bubbles: true }));
      }
      return 'sent';
    });
    console.log('Send result:', result);
    
    // Ждем генерацию (DALL-E может быть медленным)
    await newPage.waitForTimeout(60000);
    
    // Проверим результат
    const checkResult = await newPage.evaluate(() => {
      const imgs = document.querySelectorAll('img[src*="estuary"]');
      const imagegenDivs = document.querySelectorAll('div[class*="imagegen"]');
      return {
        estuaryImages: imgs.length,
        imagegenDivs: imagegenDivs.length,
        firstImgSrc: imgs.length > 0 ? imgs[0].src.substring(0, 200) : null,
        firstImgAlt: imgs.length > 0 ? imgs[0].alt.substring(0, 100) : null,
        messages: document.querySelectorAll('[data-message-author-role="assistant"]').length,
        bodyPreview: document.body.innerText.substring(0, 500)
      };
    });
    console.log('Generation result:', JSON.stringify(checkResult, null, 2));
  }
  
  await browser.close();
})();
