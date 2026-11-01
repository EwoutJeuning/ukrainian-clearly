// Search tests (plan B18): runs Ukrainian and English queries against the
// built Pagefind index in a real browser. Needs a production build in dist/.
// Usage: node scripts/test-search.mjs   (starts and stops `astro preview` itself)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4329;
const BASE = `http://localhost:${PORT}`;

// [query, a URL path expected among the first results]
const CASES = [
  ['genitive', '/grammar/genitive/'],
  ['past tense', '/grammar/past-tense/'],
  ['prepositions', '/grammar/prepositions/'],
  ['apostrophe', '/alphabet/'],
  ['мова', '/alphabet/stress-and-transliteration/'], // stressed мо́ва on the page
  ['привіт', '/sentences/greetings/'],
  ['гривня', '/sentences/shopping/'],
  ['нема', '/grammar/negation/'],
  ['середа', '/vocabulary/time/'],
  ['куди', '/grammar/questions/'],
];
const TOP = 5;

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

let failures = 0;
const browser = await chromium.launch();
try {
  await ready;
  const page = await browser.newPage();
  await page.goto(`${BASE}/search/`);
  await page.waitForFunction(() => typeof window.PagefindUI === 'function');
  for (const [query, expected] of CASES) {
    const urls = await page.evaluate(
      async ([q, top]) => {
        const pf = await import('/pagefind/pagefind.js');
        const search = await pf.search(q);
        const data = await Promise.all(search.results.slice(0, top).map((r) => r.data()));
        return data.map((d) => d.url);
      },
      [query, TOP],
    );
    const ok = urls.some((u) => u.replace(/#.*$/, '') === expected);
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  "${query}" → ${expected}${ok ? '' : `  (got: ${urls.join(', ') || 'nothing'})`}`);
  }

  // The UI itself: typing a query shows results.
  await page.fill('#search input', 'aspect');
  await page.waitForSelector('.pagefind-ui__result', { timeout: 10000 });
  console.log('ok    search UI shows results');
} catch (e) {
  failures++;
  console.error(`FAIL  ${e.message}`);
} finally {
  await browser.close();
  // Killing the npx wrapper does not stop Astro's server on Windows; ask Astro.
  await new Promise((resolve) => spawn('npx astro preview stop', { shell: true, stdio: 'ignore' }).on('exit', resolve));
  server.kill();
}
console.log(failures ? `\n${failures} search test(s) failed.` : '\nAll search tests passed.');
process.exitCode = failures ? 1 : 0;
