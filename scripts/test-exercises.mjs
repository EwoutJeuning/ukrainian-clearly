// Exercise end-to-end tests (06_exercises-prompt, "Required tests"): completes the
// greetings set in a real browser with correct, wrong, hint, reveal and retry; a
// keyboard-only path; a 360px viewport; no console errors; axe on the hub and set page.
// Needs a production build in dist/.
// Usage: node scripts/test-exercises.mjs   (starts and stops `astro preview` itself)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const PORT = 4331;
const BASE = `http://localhost:${PORT}`;
const SET = '/exercises/greetings/';

let failures = 0;
const consoleErrors = [];

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL  ${name}\n      ${String(e.message).split('\n').join('\n      ')}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${page.url()}: [${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${page.url()}: ${e.message}`));
}

async function openSet(page) {
  await page.goto(BASE + SET);
  await page.waitForSelector('[data-exercise-set][data-ready="true"]');
}

const heading = (page) => page.locator('.exercise__title');
const button = (page, name) => page.getByRole('button', { name, exact: true });
const live = (page) => page.locator('[data-live]');
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}|${el.textContent?.trim().slice(0, 40)}` : '';
  });

async function axe(page, label) {
  const result = await new AxeBuilder({ page }).analyze();
  const v = result.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
  assert(v.length === 0, `${label}: ${v.length} axe violation(s)\n${v.join('\n')}`);
}

async function noHorizontalScroll(page, label) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert(sw <= cw, `${label}: page scrolls horizontally (${sw} > ${cw})`);
}

const server = spawn(`npx astro preview --force --port ${PORT}`, { shell: true, stdio: 'pipe' });
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('astro preview did not start')), 60000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(`localhost:${PORT}`)) {
      clearTimeout(timer);
      resolve();
    }
  });
});

const browser = await chromium.launch();
try {
  await ready;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  watch(page);

  await step('hub lists the greetings set; header has Practice; axe 0 violations', async () => {
    await page.goto(BASE + '/exercises/');
    assert((await page.locator(`a[href="${SET}"]`).count()) > 0, 'no link to the set');
    assert((await page.locator('nav[aria-label="Main"] a[href="/exercises/"]').count()) === 1, 'no Practice link in the header');
    assert((await page.locator('h1').innerText()).trim() === 'Practice', 'hub h1');
    await axe(page, 'hub');
  });

  await step('set page: static intro, prerequisites, noscript, sources; axe 0 violations', async () => {
    await openSet(page);
    await page.evaluate(() => localStorage.clear());
    await openSet(page);
    assert((await page.locator('#objective').count()) === 1, 'objective heading');
    assert((await page.locator('.article-header__prereq a[href="/sentences/greetings/"]').count()) === 1, 'prerequisite link');
    assert((await page.locator('noscript').count()) === 1, 'noscript fallback');
    assert((await page.locator('#sources').count()) === 1, 'sources');
    assert((await heading(page).innerText()) === 'Question 1 of 7', 'first question heading');
    await axe(page, 'set page');
  });

  await step('choice: empty check is not an attempt; wrong answer gets targeted feedback; try again; correct', async () => {
    await button(page, 'Check answer').click();
    await page.locator('[data-feedback="info"]').waitFor();
    await page.getByLabel('До́брий день!').check();
    await button(page, 'Check answer').click();
    await page.locator('[data-feedback="incorrect"]').waitFor();
    assert((await page.locator('[data-feedback="incorrect"]').innerText()).includes('suits anyone'), 'targeted feedback');
    assert((await live(page).innerText()).startsWith('Not quite'), 'live region announces');
    assert((await page.locator('.choice--wrong').innerText()).includes('Not this one'), 'wrong choice marked in text');
    await button(page, 'Try again').click();
    assert((await page.locator('[data-feedback="incorrect"]').count()) === 0, 'feedback cleared');
    await page.getByLabel('Приві́т!').check();
    await button(page, 'Check answer').click();
    await page.locator('[data-feedback="correct"]').waitFor();
    assert((await page.locator('[data-feedback="correct"]').innerText()).includes('Correct'), 'correct label text');
    assert((await page.locator('.choice--answer').innerText()).includes('Correct answer'), 'answer marked in text');
    assert((await page.locator('a[href="/sentences/greetings/#привіт-hi"]').innerText()).includes('Greetings'), 'lesson link');
  });

  await step('next moves focus to the new question heading', async () => {
    await button(page, 'Next question').click();
    await page.waitForFunction(() => document.activeElement?.classList.contains('exercise__title'));
    assert((await heading(page).innerText()) === 'Question 2 of 7', 'question 2');
  });

  await step('hint, then correct on the first try', async () => {
    await button(page, 'Hint').click();
    await page.locator('[data-feedback="hint"]').waitFor();
    assert((await button(page, 'Hint').count()) === 0, 'hint button gone after use');
    await page.getByLabel('До́брий ве́чір!').check();
    await button(page, 'Check answer').click();
    await page.locator('[data-feedback="correct"]').waitFor();
    await button(page, 'Next question').click();
  });

  await step('match: incomplete is not an attempt; per-pair marks; corrected', async () => {
    const select = (left) => page.getByLabel(left, { exact: true });
    await select('До́брий ра́нок!').selectOption('morning');
    await button(page, 'Check answer').click();
    await page.locator('[data-feedback="info"]').waitFor();
    await select('До́брий день!').selectOption('evening');
    await select('До́брий ве́чір!').selectOption('day');
    await select('На добра́ніч!').selectOption('night');
    await select('До поба́чення!').selectOption('goodbye');
    await button(page, 'Check answer').click();
    await page.locator('[data-feedback="incorrect"]').waitFor();
    assert((await page.getByText('Not this one').count()) === 2, 'two pairs marked wrong');
    assert((await page.locator('.mark--correct').count()) === 3, 'three pairs marked right');
    await select('До́брий день!').selectOption('day');
    await select('До́брий ве́чір!').selectOption('evening');
    await button(page, 'Check answer').click();
    await page.locator('[data-feedback="correct"]').waitFor();
    await button(page, 'Next question').click();
  });

  await step('fill: Enter checks; a miss gets its feedback; focus stays in the input', async () => {
    const input = page.getByLabel('Missing word');
    await input.fill('маєш');
    await input.press('Enter');
    await page.locator('[data-feedback="incorrect"]').waitFor();
    assert((await page.locator('[data-feedback="incorrect"]').innerText()).includes('ти form'), 'miss feedback');
    assert((await page.evaluate(() => document.activeElement?.id)).endsWith('-input'), 'focus stays in input');
    // Pressing Enter again on the same wrong answer must not count a second attempt (checked in the summary).
    await input.press('Enter');
    await input.fill('');
    await page.getByRole('button', { name: 'Insert є' }).waitFor();
    const keys = await page.locator('.helper__keys [lang="uk"]').allInnerTexts();
    assert(keys.join('') === 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя’', `letter panel has all 33 letters and the apostrophe (got ${keys.join('')})`);
    await input.pressSequentially('ма');
    await page.getByRole('button', { name: 'Insert є' }).click();
    await input.pressSequentially('те');
    assert((await input.inputValue()) === 'маєте', `helper inserted є (got ${await input.inputValue()})`);
    await input.press('Enter');
    await page.locator('[data-feedback="correct"]').waitFor();
    assert((await page.evaluate(() => document.activeElement?.id)).endsWith('-input'), 'focus not stolen after correct');
    assert((await page.locator('[data-feedback="correct"]').innerText()).includes('Як ся ма́єте?'), 'answer with stress shown');
    await button(page, 'Next question').click();
  });

  await step('order: show answer marks the question revealed', async () => {
    await page.getByRole('button', { name: 'Add Непога́но.' }).click();
    await button(page, 'Show answer').click();
    await page.locator('[data-feedback="revealed"]').waitFor();
    assert((await page.locator('[data-feedback="revealed"]').innerText()).includes('Непога́но. А в те́бе?'), 'answer shown');
    assert((await page.locator('.status').innerText()).includes('Answer shown'), 'status text');
    assert((await focused(page)).startsWith('button'), 'focus moved to the next action');
    await button(page, 'Next question').click();
  });

  await step('fill (у/в): wrong then right', async () => {
    const input = page.getByLabel('Missing word');
    await input.fill('в');
    await input.press('Enter');
    await page.locator('[data-feedback="incorrect"]').waitFor();
    await input.fill('У');
    await input.press('Enter');
    await page.locator('[data-feedback="correct"]').waitFor();
    await button(page, 'Next question').click();
  });

  await step('skip the last question; summary distinguishes outcomes', async () => {
    assert((await heading(page).innerText()) === 'Question 7 of 7', 'question 7');
    await button(page, 'Skip for now').click();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Your results');
    const values = await page.locator('.summary dd').allInnerTexts();
    // first try: Q2 | after retry: Q1, Q3, Q4, Q6 | shown: Q5 | open: Q7 | hints: 1
    assert(values.join(',') === '1,4,1,1,1', `summary values ${values.join(',')}`);
    assert((await page.getByText('Set completed').count()) === 0, 'not complete');
    await axe(page, 'summary');
  });

  await step('progress persists across reload; retry needing practice; reset', async () => {
    await openSet(page);
    assert((await heading(page).innerText()) === 'Your results', 'restored to the summary');
    await page.getByRole('button', { name: 'Practise the 6 questions that need it' }).click();
    assert((await heading(page).innerText()) === 'Question 1 of 7', 'retry starts at question 1');
    await page.getByLabel('Приві́т!').check();
    await button(page, 'Check answer').click();
    await button(page, 'Next question').click();
    assert((await heading(page).innerText()) === 'Question 3 of 7', 'question 2 (already right first time) is skipped');
    await button(page, 'Reset progress').click();
    assert((await heading(page).innerText()) === 'Question 1 of 7', 'reset to question 1');
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('exercises')));
    assert(stored.length <= 1, 'storage holds at most the fresh state');
    await openSet(page);
    assert((await page.locator('[data-feedback]').count()) === 0, 'fresh after reset and reload');
  });

  await step('corrupt stored progress is ignored', async () => {
    await page.evaluate(() => localStorage.setItem('ukrainian-clearly:exercises:v1:greetings', '{oops'));
    await openSet(page);
    assert((await heading(page).innerText()) === 'Question 1 of 7', 'loads fresh');
  });

  await step('completing every question shows "Set completed"', async () => {
    await page.evaluate(() => localStorage.clear());
    await openSet(page);
    for (let i = 0; i < 7; i++) {
      await button(page, 'Show answer').click();
      await button(page, i === 6 ? 'See your results' : 'Next question').click();
    }
    await page.getByText('Set completed').waitFor();
    const values = await page.locator('.summary dd').allInnerTexts();
    assert(values.join(',') === '0,0,7,0,0', `summary values ${values.join(',')}`);
    await button(page, 'Start the set again').click();
    assert((await heading(page).innerText()) === 'Question 1 of 7', 'start again');
  });

  await step('keyboard only: choice, match, fill and order', async () => {
    await page.evaluate(() => localStorage.clear());
    await openSet(page);
    const kb = page.keyboard;
    async function tabTo(test, max = 40) {
      for (let i = 0; i < max; i++) {
        await kb.press('Tab');
        if (await page.evaluate(test)) return;
      }
      throw new Error(`could not reach element by Tab: ${test}`);
    }
    // Q1: radios with arrow keys, then Check.
    await page.locator('.exercise__title').focus();
    await tabTo(() => document.activeElement?.matches('input[type=radio]'));
    // Arrow keys select the next radio; Приві́т! is first, so go down and back up.
    await kb.press('ArrowDown');
    await kb.press('ArrowUp');
    await tabTo(() => document.activeElement?.textContent?.trim() === 'Check answer');
    await kb.press('Enter');
    await page.locator('[data-feedback="correct"]').waitFor();
    await tabTo(() => document.activeElement?.textContent?.trim() === 'Next question');
    await kb.press('Enter');
    // Q2: skip by keyboard.
    await tabTo(() => document.activeElement?.textContent?.trim() === 'Skip for now');
    await kb.press('Enter');
    // Q3: selects by keyboard (type-ahead on the focused select).
    const answers = ['Good morning!', 'Hello! / Good afternoon!', 'Good evening!', 'Good night! (going to bed)', 'Goodbye!'];
    for (const label of answers) {
      await tabTo(() => document.activeElement?.tagName === 'SELECT');
      // Keyboard selection of an option: arrow down until the wanted text is selected.
      for (let i = 0; i < 7; i++) {
        const text = await page.evaluate(() => {
          const s = /** @type {HTMLSelectElement} */ (document.activeElement);
          return s.options[s.selectedIndex]?.text;
        });
        if (text === label) break;
        await kb.press('ArrowDown');
      }
    }
    await tabTo(() => document.activeElement?.textContent?.trim() === 'Check answer');
    await kb.press('Enter');
    await page.locator('[data-feedback="correct"]').waitFor();
    await tabTo(() => document.activeElement?.textContent?.trim() === 'Next question');
    await kb.press('Enter');
    // Q4: type and press Enter.
    await tabTo(() => document.activeElement?.tagName === 'INPUT');
    await kb.type('маєте');
    await kb.press('Enter');
    await page.locator('[data-feedback="correct"]').waitFor();
    await tabTo(() => document.activeElement?.textContent?.trim() === 'Next question');
    await kb.press('Enter');
    // Q5: build "Непога́но. А в те́бе?" from the bank (displayed: те́бе? Непога́но. в А).
    await tabTo(() => document.activeElement?.hasAttribute('data-bank-token'));
    const wanted = ['nepohano', 'a', 'v', 'tebe'];
    for (const id of wanted) {
      // Focus moves to the next bank token after each add; walk to the wanted one.
      for (let i = 0; i < 6; i++) {
        if (await page.evaluate((t) => document.activeElement?.getAttribute('data-bank-token') === t, id)) break;
        await kb.press('Tab');
      }
      await kb.press('Enter');
    }
    assert((await focused(page)).includes('Check answer'), `focus on Check answer after the bank empties (got ${await focused(page)})`);
    // Move a word with the keyboard controls and back.
    await page.locator('[data-token="a"][data-act="later"]').focus();
    await kb.press('Enter');
    assert(await page.evaluate(() => document.activeElement?.getAttribute('data-token') === 'a'), 'focus follows the moved word');
    await kb.press('Shift+Tab');
    await kb.press('Enter');
    await tabTo(() => document.activeElement?.textContent?.trim() === 'Check answer');
    await kb.press('Enter');
    await page.locator('[data-feedback="correct"]').waitFor();
  });

  await step('360px viewport: no horizontal scroll; controls at least 44px', async () => {
    const small = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
    const p = await small.newPage();
    watch(p);
    await p.goto(BASE + '/exercises/');
    await noHorizontalScroll(p, 'hub 360');
    await p.goto(BASE + SET);
    await p.waitForSelector('[data-exercise-set][data-ready="true"]');
    for (let i = 0; i < 7; i++) {
      await noHorizontalScroll(p, `question ${i + 1} at 360px`);
      const small44 = await p.evaluate(() =>
        [...document.querySelectorAll('.exercise button, .exercise select, .exercise input[type=text], .exercise label.choice')]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .filter((el) => el.getBoundingClientRect().height < 44)
          .map((el) => el.textContent?.trim().slice(0, 30)),
      );
      assert(small44.length === 0, `question ${i + 1}: targets under 44px: ${small44.join(' | ')}`);
      if (i === 4) {
        // Tap words into the sentence on a touch screen.
        await p.getByRole('button', { name: 'Add Непога́но.' }).tap();
        await p.getByRole('button', { name: 'Add А' }).tap();
        await noHorizontalScroll(p, 'order with placed words at 360px');
      }
      await p.getByRole('button', { name: 'Show answer' }).tap();
      await p.getByRole('button', { name: i === 6 ? 'See your results' : 'Next question' }).tap();
    }
    await noHorizontalScroll(p, 'summary 360');
    await small.close();
  });

  await step('no console errors or warnings', async () => {
    assert(consoleErrors.length === 0, consoleErrors.join('\n'));
  });
} catch (e) {
  failures++;
  console.error(`FAIL  ${e.message}`);
} finally {
  await browser.close();
  // Killing the npx wrapper does not stop Astro's server on Windows; ask Astro.
  await new Promise((resolve) => spawn('npx astro preview stop', { shell: true, stdio: 'ignore' }).on('exit', resolve));
  server.kill();
}
console.log(failures ? `\n${failures} exercise test(s) failed.` : '\nAll exercise tests passed.');
process.exitCode = failures ? 1 : 0;
