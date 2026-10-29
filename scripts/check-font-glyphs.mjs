// Verifies that the self-hosted Manrope and Noto Sans WOFF2 files actually
// contain the glyphs Ukrainian text needs, and that stress marks are placed
// correctly.

// Part 1, glyph presence: Only the subsets configured in
// astro.config.mjs are considered. For each character, the @font-face rules
// whose unicode-range covers it are tried (last defined first, as browsers do),
// and the character passes if one of those files has the glyph in its cmap.
//
// Part 2, stress-mark placement: shapes every Ukrainian vowel + U+0301 with
// HarfBuzz (the shaper Chromium, Firefox and Android use) and checks that the
// mark's centre falls within the vowel's advance box. Glyph presence alone is
// not enough: Inter has U+0301 but draws it after the vowel (мо́ва put the accent
// on в), which is why the body font is Noto Sans.
// Usage: npm run check:fonts
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';
import * as hb from 'harfbuzzjs';
import wawoff2 from 'wawoff2';

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
  ['Noto Sans', '@fontsource-variable/noto-sans/wght.css'],
  ['Noto Sans italic', '@fontsource-variable/noto-sans/wght-italic.css'],
  // --font-heading is "Manrope, Noto Sans, system": a glyph Manrope lacks is
  // drawn by Noto Sans, which is acceptable but reported.
  ['Manrope', '@fontsource-variable/manrope/wght.css', 'Noto Sans'],
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
// Part 2: stress-mark placement.
const VOWELS = 'аеиіоуюяєїАЕИІОУЮЯЄЇ';
const ACUTE = 0x0301;
for (const [name] of fonts) {
  const list = loaded[name];
  const face = covers(list, ACUTE);
  if (!face.ok) {
    console.log(`${name}: stress placement not tested (U+0301 not in this font; keep stress marks out of text set in it)`);
    continue;
  }
  const entry = [...list].reverse().find((f) => f.subset === face.subset);
  const file = entry.file;
  // Italic marks sit over the slanted top of the letter: shift the expected
  // span right by the mark's height times the slant (post.italicAngle).
  const slant = Math.tan((-(entry.font.italicAngle || 0) * Math.PI) / 180);
  const ttf = await wawoff2.decompress(new Uint8Array(readFileSync(file)));
  const font = new hb.Font(new hb.Face(new hb.Blob(ttf)));
  const bad = [];
  for (const v of VOWELS) {
    const buf = new hb.Buffer();
    buf.addText(v + '́');
    buf.guessSegmentProperties();
    buf.setLanguage('uk');
    hb.shape(font, buf);
    const info = buf.getGlyphInfos();
    const pos = buf.getGlyphPositions();
    if (info.length === 1) continue; // composed into one glyph: placed by design
    const mark = font.glyphExtents(info[1].codepoint);
    const centre = pos[0].xAdvance + pos[1].xOffset + mark.xBearing + mark.width / 2;
    const shift = Math.max(0, mark.yBearing + mark.height) * slant;
    const lo = pos[0].xOffset + shift;
    const hi = pos[0].xAdvance + shift;
    if (centre < lo || centre > hi) {
      bad.push(`${v} (mark centre ${Math.round(centre)}, vowel spans ${Math.round(lo)}..${Math.round(hi)})`);
    }
  }
  if (bad.length) {
    failures += bad.length;
    console.log(`${name}: stress placement FAILED for ${bad.length}/${VOWELS.length} vowels: ${bad.join('; ')}`);
  } else {
    console.log(`${name}: stress mark placed over all ${VOWELS.length} vowels (${face.subset} subset)`);
  }
}

// exitCode, not process.exit(): exiting while the wasm decoder's handles close
// crashes Node on Windows (libuv assertion in async.c).
process.exitCode = failures ? 1 : 0;
