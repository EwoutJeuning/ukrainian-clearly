// Crawls dist/**/*.html and reports broken internal links and missing #anchors.
// Usage: npm run build && npm run check:links
// Exit code 1 if anything is broken.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = join(process.cwd(), 'dist');
if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const toUrlPath = (file) => '/' + relative(DIST, file).split(sep).join('/');

/** Site path ("/grammar/") -> file in dist, or undefined. */
function resolveTarget(pathname) {
  const p = decodeURIComponent(pathname);
  const candidates = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html', p + '/index.html'];
  for (const c of candidates) {
    const f = join(DIST, ...c.split('/').filter(Boolean));
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return undefined;
}

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

const idCache = new Map();
function idsIn(file) {
  if (!idCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    const ids = new Set();
    for (const m of html.matchAll(/\s(?:id|name)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      ids.add(decodeEntities(m[1] ?? m[2] ?? m[3]));
    }
    idCache.set(file, ids);
  }
  return idCache.get(file);
}

const problems = [];
let checked = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8')
    // Ignore code samples and comments.
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|code|pre)\b[\s\S]*?<\/\1>/gi, '');
  const pagePath = toUrlPath(file);
  const base = new URL(pagePath.replace(/index\.html$/, ''), 'http://site.invalid');

  for (const m of html.matchAll(/<(a|link|img|script|source)\b[^>]*?\s(href|src)=(?:"([^"]*)"|'([^']*)')/gi)) {
    const raw = decodeEntities(m[3] ?? m[4] ?? '');
    if (!raw || /^(mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
    let url;
    try {
      url = new URL(raw, base);
    } catch {
      problems.push(`${pagePath}: invalid URL "${raw}"`);
      continue;
    }
    if (url.origin !== base.origin) continue; // external
    checked++;
    const target = resolveTarget(url.pathname);
    if (!target) {
      problems.push(`${pagePath}: broken link "${raw}" (no file for ${url.pathname})`);
      continue;
    }
    if (url.hash && url.hash !== '#' && target.endsWith('.html')) {
      const id = decodeURIComponent(url.hash.slice(1));
      if (!idsIn(target).has(id)) {
        problems.push(`${pagePath}: missing anchor "${raw}" (no id="${id}" in ${toUrlPath(target)})`);
      }
    }
  }
}

console.log(`Checked ${checked} internal links and anchors in ${htmlFiles.length} HTML files.`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('No broken internal links or anchors.');
