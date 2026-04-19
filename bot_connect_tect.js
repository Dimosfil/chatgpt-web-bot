const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const pages = context.pages();
    const page = pages[0] || await context.newPage();

    console.log('Успешно подключился к Chrome по CDP');
    console.log('Открытые вкладки:', pages.length);

    await page.goto('https://chatgpt.com/', {
      waitUntil: 'commit',
      timeout: 120000,
    });

    console.log('Открыл chatgpt.com');
  } catch (err) {
    console.error('Не удалось подключиться к Chrome по CDP.');
    console.error('Проверь, что Chrome запущен с --remote-debugging-port=9222');
    console.error('Оригинальная ошибка:', err.message);
    process.exit(1);
  }
})();