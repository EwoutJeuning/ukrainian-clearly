// Verifies that the self-hosted Manrope and Inter WOFF2 files actually contain
// the glyphs Ukrainian text needs. Only the subsets configured in
// astro.config.mjs are considered. For each character, the @font-face rules
// whose unicode-range covers it are tried (last defined first, as browsers do),
// and the character passes if one of those files has the glyph in its cmap.
// Usage: npm run check:fonts
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';

const require = createRequire(import.meta.url);

// Must match `subsets` in astro.config.mjs.
const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'];

const UKRAINIAN =
  'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯабвгґдеєжзиіїйклмнопрстуфхцчшщьюя';
// U+2019 apostrophe (site convention), U+0301 combining acute (stress),
// guillemets, dashes, numero sign.
const EXTRA = '’́«»—–№';
// Reported, not required: U+02BC MODIFIER LETTER APOSTROPHE (the site uses U+2019).
const OPTIONAL = [0x02bc];

const required = [...(UKRAINIAN + EXTRA)].map((c) => c.codePointAt(0));
const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

function parseRanges(str) {
  return str.split(',').map((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, '').split('-');
    const lo = parseInt(a, 16);
    return [lo, b ? parseInt(b, 16) : lo];
  });
}

function faces(cssPath) {
  const css = readFileSync(cssPath, 'utf8');
  const out = [];
  for (const block of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const src = block[1].match(/url\(([^)]+)\)/)?.[1];
    const range = block[1].match(/unicode-range:\s*([^;]+);/)?.[1];
    if (!src || !range) continue;
    const subset = SUBSETS.find((s) => basename(src).includes(`-${s}-wght`));
    if (!subset) continue;
    const file = join(dirname(cssPath), src);
    out.push({ subset, file, font: fontkit.openSync(file), ranges: parseRanges(range) });
  }
  return out;
}

function covers(list, cp) {
  const candidates = [...list].reverse().filter((f) => f.ranges.some(([lo, hi]) => cp >= lo && cp <= hi));
  if (!candidates.length) return { ok: false, why: 'no unicode-range covers it' };
  const hit = candidates.find((f) => f.font.hasGlyphForCodePoint(cp));
  if (!hit) return { ok: false, why: `not in ${candidates.map((f) => f.subset).join(', ')}` };
  return { ok: true, subset: hit.subset };
}

// [name, css entry, fallback font name used by the CSS font stack]
const fonts = [
  ['Inter', '@fontsource-variable/inter/wght.css'],
  ['Inter italic', '@fontsource-variable/inter/wght-italic.css'],
  // --font-heading is "Manrope, Inter, system": a glyph Manrope lacks is drawn
  // by Inter, which is acceptable but reported.
  ['Manrope', '@fontsource-variable/manrope/wght.css', 'Inter'],
];
const loaded = {};

let failures = 0;
for (const [name, entry, fallback] of fonts) {
  const list = faces(require.resolve(entry));
  loaded[name] = list;
  const bySubset = {};
  const missing = [];
  for (const cp of required) {
    const r = covers(list, cp);
    if (r.ok) (bySubset[r.subset] ??= []).push(String.fromCodePoint(cp));
    else if (fallback && covers(loaded[fallback], cp).ok) {
      console.log(`  note: ${hex(cp)} not in ${name} (${r.why}); drawn by fallback ${fallback}`);
    } else missing.push(`${hex(cp)} (${r.why})`);
  }
  const own = Object.values(bySubset).flat().length;
  console.log(`${name} (${list.map((f) => f.subset).join(', ')}): ${own}/${required.length} required code points in the font itself`);
  for (const [subset, chars] of Object.entries(bySubset)) {
    console.log(`  ${subset}: ${chars.map((c) => (c === '́' ? 'U+0301' : c)).join('')}`);
  }
  for (const cp of OPTIONAL) {
    const r = covers(list, cp);
    console.log(`  optional ${hex(cp)}: ${r.ok ? `present (${r.subset})` : `absent (${r.why})`}`);
  }
  if (missing.length) {
    failures += missing.length;
    console.log(`  MISSING: ${missing.join('; ')}`);
  }
}
process.exit(failures ? 1 : 0);
