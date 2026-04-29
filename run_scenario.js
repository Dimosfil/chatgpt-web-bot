const { DEFAULT_PROMPT, PROJECT_NAME } = require('./src/config');
const { ts, logStep } = require('./src/utils');

const { connectChrome } = require('./src/steps/connectChrome');
const { getChatGPTPage } = require('./src/steps/getChatGPTPage');
const { openProjectFolder } = require('./src/steps/openProjectFolder');
const { createNewChat } = require('./src/steps/createNewChat');
const { getAssistantCount } = require('./src/steps/getAssistantCount');
const { findComposer } = require('./src/steps/findComposer');
const { fillComposer } = require('./src/steps/fillComposer');
const { sendMessage } = require('./src/steps/sendMessage');
const { waitForAssistantReply } = require('./src/steps/waitForAssistantReply');

const PROMPT = process.argv.slice(2).join(' ') || DEFAULT_PROMPT;

(async () => {
  const globalStart = ts();

  try {
    const t1 = ts();
    const { context } = await connectChrome();
    logStep(t1, 'Подключился к Chrome');

    const t2 = ts();
    const page = await getChatGPTPage(context);
    logStep(t2, 'Нашёл/открыл ChatGPT');

    const t3 = ts();
    const openedProject = await openProjectFolder(page, PROJECT_NAME);
    logStep(
      t3,
      openedProject
        ? `Открыл проект "${PROJECT_NAME}"`
        : `Проект "${PROJECT_NAME}" не найден, продолжаю без него`
    );

    //const t4 = ts();
    //await createNewChat(page);
    //logStep(t4, 'Создал новый чат');

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