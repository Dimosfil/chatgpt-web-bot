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

module.exports = { fillComposer };