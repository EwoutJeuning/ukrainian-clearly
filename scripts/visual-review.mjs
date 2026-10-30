// Visual and accessibility review against a running dev server (plan B4/B19/B20).
// Usage: node scripts/visual-review.mjs [outDir] [baseUrl]
// Screenshots and results.json go to outDir (keep it outside the repo).
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'visual-review-out';
const BASE = process.argv[3] ?? 'http://localhost:4321';
mkdirSync(OUT, { recursive: true });

// REVIEW_PAGES (comma-separated paths) replaces the default list for the per-page checks.
const PAGES = process.env.REVIEW_PAGES ? process.env.REVIEW_PAGES.split(',') : [
  '/',
  '/dev/components/',
  '/grammar/fixture-article/',
  '/grammar/fixture-prerequisite/',
  '/vocabulary/_fixture-theme/',
  '/glossary/',
  '/grammar/',
  '/vocabulary/',
];
const CONFIGS = [
  { name: '360', width: 360, height: 800, dpr: 1 },
  { name: '768', width: 768, height: 1024, dpr: 1 },
  { name: '1280', width: 1280, height: 900, dpr: 1 },
  { name: '1280z200', width: 640, height: 450, dpr: 2 },
];
// The Astro dev toolbar is a dev-only overlay; exclude it from checks.
const DEV_TOOLBAR = 'astro-dev-toolbar';

const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/[/_]+/g, '-'));
const results = { pages: {}, fonts: {}, menu: {}, keyboard: {}, toc: {}, motion: {}, tables: {} };

const browser = await chromium.launch();

async function newPage(cfg, extra = {}) {
  const context = await browser.newContext({
    viewport: { width: cfg.width, height: cfg.height },
    deviceScaleFactor: cfg.dpr,
    ...extra,
  });
  const page = await context.newPage();
  const log = { console: [], pageErrors: [], failed: [], badStatus: [], fonts: [] };
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.console.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.pageErrors.push(String(e)));
  page.on('requestfailed', (r) => log.failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) log.badStatus.push(`${r.status()} ${r.url()}`);
    if (r.request().resourceType() === 'font') log.fonts.push(`${r.status()} ${r.url().split('/').pop()}`);
  });
  return { context, page, log };
}

async function load(page, path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Hide the dev toolbar so it doesn't appear in screenshots.
  await page.addStyleTag({ content: `${DEV_TOOLBAR}{display:none!important}` });
}

// ---------- per page x width ----------
for (const path of PAGES) {
  results.pages[path] = {};
  for (const cfg of CONFIGS) {
    const { context, page, log } = await newPage(cfg);
    await load(page, path);
    const file = join(OUT, `${slug(path)}_${cfg.name}.png`);
    await page.screenshot({ path: file, fullPage: true });

    const info = await page.evaluate((tb) => {
      const de = document.documentElement;
      const cw = de.clientWidth;
      const describe = (el) =>
        el.tagName.toLowerCase() +
        (el.id ? `#${el.id}` : '') +
        (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      const offenders = [];
      for (const el of document.body.querySelectorAll('*')) {
        if (el.closest(tb)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > cw + 0.5 || r.left < -0.5) {
          // Skip descendants of a horizontal scroll container (they're contained).
          let p = el.parentElement, contained = false;
          while (p && p !== document.body) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') { contained = true; break; }
            p = p.parentElement;
          }
          if (!contained) offenders.push(`${describe(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
        }
      }
      const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .filter((h) => !h.closest(tb))
        .map((h) => ({ level: +h.tagName[1], text: h.textContent.trim().slice(0, 50), visible: !!h.getClientRects().length }));
      const skips = [];
      let prev = 0;
      for (const h of heads.filter((x) => x.visible)) {
        if (prev && h.level > prev + 1) skips.push(`h${prev} -> h${h.level} "${h.text}"`);
        prev = h.level;
      }
      // Cyrillic text nodes not inside a lang="uk" ancestor.
      const noLang = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!/[Ѐ-ӿ]/.test(n.textContent)) continue;
        const el = n.parentElement;
        if (!el || el.closest(tb) || el.closest('script,style')) continue;
        const l = el.closest('[lang]')?.getAttribute('lang');
        if (l !== 'uk') noLang.push(`${describe(el)}: "${n.textContent.trim().slice(0, 40)}"`);
      }
      const bodyP = document.querySelector('main p');
      return {
        htmlLang: de.lang,
        scrollWidth: de.scrollWidth,
        clientWidth: cw,
        overflow: de.scrollWidth > cw,
        offenders: offenders.slice(0, 15),
        h1Count: heads.filter((h) => h.level === 1).length,
        headings: heads.map((h) => `h${h.level}${h.visible ? '' : '(hidden)'} ${h.text}`),
        skips,
        landmarks: {
          header: document.querySelectorAll('body > header, [role=banner]').length,
          nav: [...document.querySelectorAll('nav')].filter((n) => n.getClientRects().length).map((n) => n.getAttribute('aria-label')),
          main: document.querySelectorAll('main').length,
          footer: document.querySelectorAll('body > footer, [role=contentinfo]').length,
        },
        cyrillicWithoutUk: noLang.slice(0, 10),
        bodyFontSize: bodyP ? getComputedStyle(bodyP).fontSize + ' / ' + getComputedStyle(bodyP).lineHeight : null,
        h1Size: document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).fontSize : null,
      };
    }, DEV_TOOLBAR);

    let axe = null;
    if (cfg.name === '360' || cfg.name === '1280') {
      const r = await new AxeBuilder({ page }).exclude(DEV_TOOLBAR).analyze();
      axe = r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n').slice(1, 2).join(' ')}`),
      }));
    }
    results.pages[path][cfg.name] = { screenshot: file, ...info, ...log, axe };
    await context.close();
  }
}

// ---------- fonts via CDP ----------
{
  const { context, page } = await newPage(CONFIGS[2]);
  await load(page, '/dev/components/');
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const targets = {
    h1: 'main h1',
    h2: 'main h2#glyphs',
    bodyParagraph: '#glyphs + p',
    ukExample: '.example [lang="uk"]',
    stressHeading: 'h3.glyph-heading',
    interGlyphRow: '.glyph-block:nth-of-type(1) .glyph-row span[lang="uk"]',
    manropeGlyphRow: '.glyph-block:nth-of-type(2) .glyph-row span[lang="uk"]',
    wordmark: '.wordmark span',
  };
  for (const [k, sel] of Object.entries(targets)) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    if (!nodeId) { results.fonts[k] = `selector not found: ${sel}`; continue; }
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    const text = await page.locator(sel).first().textContent();
    const family = await page.locator(sel).first().evaluate((e) => getComputedStyle(e).fontFamily);
    results.fonts[k] = { sel, text: text.trim().slice(0, 60), cssFamily: family, rendered: fonts };
  }
  // Glyph-test close-ups at 3x.
  await context.close();
  const z = await newPage({ width: 1280, height: 900, dpr: 3 });
  await load(z.page, '/dev/components/');
  const glyph = z.page.locator('section[aria-labelledby="glyphs"]');
  await glyph.screenshot({ path: join(OUT, 'glyphs_3x.png') });
  await z.page.locator('h3.glyph-heading').screenshot({ path: join(OUT, 'glyph-heading_3x.png') });
  const blocks = z.page.locator('.glyph-block');
  for (let i = 0; i < (await blocks.count()); i++) await blocks.nth(i).screenshot({ path: join(OUT, `glyph-block-${i}_3x.png`) });
  results.fonts.glyphFontRequests = z.log.fonts;
  await z.context.close();
}

// ---------- keyboard ----------
for (const cfg of [CONFIGS[0], CONFIGS[2]]) {
  const { context, page } = await newPage(cfg);
  await load(page, '/grammar/fixture-article/');
  const k = { order: [] };
  const describeFocus = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''),
        text: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} offset ${cs.outlineOffset}`,
        visibleInViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      };
    });
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const f = await describeFocus();
    k.order.push(f);
    if (i === 0) {
      await page.screenshot({ path: join(OUT, `kbd_skiplink_${cfg.name}.png`) });
      await page.keyboard.press('Enter');
      k.afterSkip = await page.evaluate(() => ({ active: document.activeElement.id || document.activeElement.tagName, hash: location.hash }));
      k.afterSkipNextTab = (await page.keyboard.press('Tab'), await describeFocus());
      // Restart from the top for the header order.
      await load(page, '/grammar/fixture-article/');
      await page.keyboard.press('Tab');
    }
    const clip = (r) => ({ x: Math.max(0, r[0] - 12), y: Math.max(0, r[1] - 12), width: Math.min(r[2] + 24, cfg.width), height: r[3] + 24 });
    if (f.visibleInViewport && f.rect[2] > 0 && i > 0 && i < 8) {
      await page.screenshot({ path: join(OUT, `kbd_focus_${cfg.name}_${i}_${f.el.replace(/[^a-z0-9-]/gi, '')}.png`), clip: clip(f.rect) });
    }
  }
  // A button: menu toggle on mobile; the .button in the showcase on desktop.
  await load(page, '/dev/components/');
  const btn = page.locator('main .button, main button').first();
  if (await btn.count()) {
    await btn.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const f = await describeFocus();
    k.buttonFocus = f;
    await btn.screenshot({ path: join(OUT, `kbd_button_${cfg.name}.png`) }).catch(() => {});
    const bb = await btn.boundingBox();
    if (bb) await page.screenshot({ path: join(OUT, `kbd_button_ctx_${cfg.name}.png`), clip: { x: Math.max(0, bb.x - 10), y: Math.max(0, bb.y - 10), width: bb.width + 20, height: bb.height + 20 } });
  }
  results.keyboard[cfg.name] = k;
  await context.close();
}

// ---------- mobile menu ----------
for (const cfg of [CONFIGS[0], CONFIGS[1], CONFIGS[3]]) {
  const { context, page } = await newPage(cfg);
  await load(page, '/grammar/fixture-article/');
  const toggle = page.locator('.menu-toggle');
  const m = {};
  m.toggleVisible = await toggle.isVisible();
  if (m.toggleVisible) {
    m.initial = await toggle.getAttribute('aria-expanded');
    m.menuVisibleInitially = await page.locator('#site-menu').isVisible();
    // Keyboard: tab to the toggle.
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // wordmark
    await page.keyboard.press('Tab'); // toggle
    m.focusedToggle = await page.evaluate(() => document.activeElement.classList.contains('menu-toggle'));
    const tb = await toggle.boundingBox();
    await page.screenshot({ path: join(OUT, `menu_toggle_focus_${cfg.name}.png`), clip: { x: Math.max(0, tb.x - 12), y: Math.max(0, tb.y - 12), width: tb.width + 24, height: tb.height + 24 } });
    await page.keyboard.press('Enter');
    m.afterOpen = await toggle.getAttribute('aria-expanded');
    m.menuVisibleAfterOpen = await page.locator('#site-menu').isVisible();
    m.focusAfterOpen = await page.evaluate(() => document.activeElement.textContent.trim());
    await page.screenshot({ path: join(OUT, `menu_open_${cfg.name}.png`) });
    // Does the open menu push content down (in flow) or overlay it?
    m.menuPosition = await page.evaluate(() => getComputedStyle(document.querySelector('#site-menu')).position);
    m.mainTopVsHeaderBottom = await page.evaluate(() => {
      const h = document.querySelector('.site-header').getBoundingClientRect();
      const mn = document.querySelector('main').getBoundingClientRect();
      return { headerBottom: Math.round(h.bottom), mainTop: Math.round(mn.top) };
    });
    await page.keyboard.press('Escape');
    m.afterEscape = await toggle.getAttribute('aria-expanded');
    m.focusAfterEscape = await page.evaluate(() => document.activeElement.className);
    // Tab through the open menu and out of it: no trap, closes on leave.
    await page.keyboard.press('Enter');
    const seq = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      seq.push(await page.evaluate(() => {
        const a = document.activeElement;
        return (a.closest('header') ? 'header:' : 'out:') + a.textContent.trim().replace(/\s+/g, ' ').slice(0, 25);
      }));
    }
    m.tabSequenceFromOpenMenu = seq;
    m.expandedAfterTabbingOut = await toggle.getAttribute('aria-expanded');
    // Click toggle with mouse twice.
    await toggle.click();
    m.afterClick = await toggle.getAttribute('aria-expanded');
    await toggle.click();
    m.afterSecondClick = await toggle.getAttribute('aria-expanded');
  }
  results.menu[cfg.name] = m;
  await context.close();
}

// ---------- TOC anchors / sticky ----------
for (const cfg of [CONFIGS[0], CONFIGS[2]]) {
  const { context, page } = await newPage(cfg);
  await load(page, '/grammar/fixture-article/');
  const t = { links: [] };
  const details = page.locator('details.toc--disclosure');
  if (await details.isVisible()) {
    t.variant = 'disclosure';
    await details.locator('summary').click();
  } else t.variant = (await page.locator('nav.toc').isVisible()) ? 'sidebar' : 'none';
  const sel = t.variant === 'disclosure' ? 'details.toc--disclosure a' : 'nav.toc a';
  const n = await page.locator(sel).count();
  for (let i = 0; i < n; i++) {
    await load(page, '/grammar/fixture-article/');
    if (t.variant === 'disclosure') await page.locator('details.toc--disclosure summary').click();
    const a = page.locator(sel).nth(i);
    const href = await a.getAttribute('href');
    await a.click();
    await page.waitForTimeout(800);
    const r = await page.evaluate((id) => {
      const h = document.getElementById(decodeURIComponent(id.slice(1)));
      if (!h) return { missing: true };
      const b = h.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.min(b.left + 5, innerWidth - 1), b.top + Math.min(5, b.height / 2));
      const stickies = [...document.querySelectorAll('*')].filter((e) => ['sticky', 'fixed'].includes(getComputedStyle(e).position)).map((e) => {
        const r = e.getBoundingClientRect();
        return `${e.tagName.toLowerCase()}.${e.className} top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} left=${Math.round(r.left)} right=${Math.round(r.right)}`;
      });
      return { top: Math.round(b.top), covered: !(hit === h || h.contains(hit)), hit: hit?.tagName, stickies };
    }, href);
    t.links.push({ href, ...r });
  }
  if (t.links.length) await page.screenshot({ path: join(OUT, `toc_jump_${cfg.name}.png`) });
  results.toc[cfg.name] = t;
  await context.close();
}

// ---------- reduced motion ----------
for (const rm of ['no-preference', 'reduce']) {
  const { context, page } = await newPage(CONFIGS[2], { reducedMotion: rm });
  await load(page, '/dev/components/');
  results.motion[rm] = await page.evaluate(() => {
    const out = { scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior, elements: {}, nonZero: [] };
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('astro-dev-toolbar')) continue;
      const cs = getComputedStyle(el);
      const td = cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
      const ad = cs.animationName !== 'none' && cs.animationDuration.split(',').some((d) => parseFloat(d) > 0);
      if (td || ad) out.nonZero.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} t=${cs.transitionDuration} a=${cs.animationName}/${cs.animationDuration}`);
    }
    out.nonZeroCount = out.nonZero.length;
    out.nonZero = [...new Set(out.nonZero)].slice(0, 12);
    return out;
  });
  await context.close();
}

// ---------- tables ----------
for (const path of ['/dev/components/', '/grammar/fixture-article/', '/vocabulary/_fixture-theme/', '/glossary/']) {
  const { context, page } = await newPage(CONFIGS[0]);
  await load(page, path);
  const cdp = await context.newCDPSession(page);
  const tables = await page.evaluate(() =>
    [...document.querySelectorAll('.grammar-table, main table')].map((t) => {
      const box = t.classList.contains('grammar-table') ? t : t.parentElement;
      const cs = getComputedStyle(box);
      return {
        kind: t.classList.contains('grammar-table') ? 'GrammarTable' : `table in ${box.tagName.toLowerCase()}.${box.className}`,
        role: box.getAttribute('role'),
        tabindex: box.getAttribute('tabindex'),
        labelledby: box.getAttribute('aria-labelledby'),
        labelText: box.getAttribute('aria-labelledby') ? document.getElementById(box.getAttribute('aria-labelledby'))?.textContent.trim() : null,
        overflowX: cs.overflowX,
        clientWidth: box.clientWidth,
        scrollWidth: box.scrollWidth,
        scrolls: box.scrollWidth > box.clientWidth,
        right: Math.round(box.getBoundingClientRect().right),
        tableFontSize: getComputedStyle(t.tagName === 'TABLE' ? t : t.querySelector('table')).fontSize,
      };
    }),
  );
  // Accessible name from the browser's accessibility tree.
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const regions = nodes.filter((n) => n.role?.value === 'region').map((n) => n.name?.value);
  // Focus the first table region and screenshot.
  const first = page.locator('.grammar-table').first();
  if (await first.count()) {
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement.classList.contains('grammar-table'));
    await first.screenshot({ path: join(OUT, `table_focus_360_${slug(path)}.png`) });
    // Keyboard scroll inside the region.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const scrolled = await first.evaluate((e) => e.scrollLeft);
    results.tables[path] = { tables, axRegionNames: regions, firstFocusedByTab: focused, scrollLeftAfterArrowRight: scrolled };
  } else results.tables[path] = { tables, axRegionNames: regions };
  await context.close();
}

await browser.close();
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`Wrote ${join(OUT, 'results.json')}`);
