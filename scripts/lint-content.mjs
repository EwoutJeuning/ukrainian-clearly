#!/usr/bin/env node
// Content lint for Ukrainian text (plan.md B17, A9, A10; docs/conventions.md c, d).
//
// Usage:
//   node scripts/lint-content.mjs                 lint src/content/** (drafts named _fixture* skipped)
//   node scripts/lint-content.mjs --fixtures      also lint _fixture* / _fixtures/ files
//   node scripts/lint-content.mjs FILE...         lint only the given files
//   node scripts/lint-content.mjs --self-test     check the rules against scripts/fixtures/
//
// Prints `file:line:col  level  rule  message` and exits 1 if there is any error.
// Warnings never fail the run.
//
// Rules (errors unless noted):
//   latin-in-cyrillic   Latin letter inside a Cyrillic word (look-alikes a e o i c p x y ...).
//   precomposed-stress  Precomposed accented letter (á é ó, ѐ ѝ ...) inside a Cyrillic word;
//                       write the plain vowel followed by U+0301.
//   stress-position     U+0301 not directly after a Cyrillic vowel (а е и і о у ю я є ї, any case).
//   double-stress       More than one U+0301 in one word.
//   apostrophe          ' (U+0027) or ʼ (U+02BC) between Cyrillic letters; use ’ (U+2019).
//   stress-in-heading   U+0301 in a heading: Markdown `#` lines, `title` and `term` fields
//                       (the heading font has no combining acute).
//   russian-letter      ы э ъ ё (any case): not in the Ukrainian alphabet.
//   unmarked-ukrainian  WARNING. MDX body text with Cyrillic outside <Example>, <Uk>,
//                       <GrammarTable>, a Markdown table, or an element with lang="uk".
//                       Not warned about: Cyrillic in Markdown `#` headings and in the `title`
//                       attribute of <ExampleList>; the site marks those lang="uk" itself
//                       (src/components/Heading.astro via mdxComponents; UkText.astro).
//   uk-en-dash          Spaced en dash ( – ) between Cyrillic words inside Ukrainian text
//                       (<Uk>, <Example>, lang="uk"). House rule: spaced em dash ( — ).
//
// Not checked: fenced code blocks and inline `code` spans, JSX/HTML comments, import/export
// lines. In JSON files, \uXXXX escapes are decoded before checking.
//
// Ignoring a line (for deliberate mentions, e.g. an article that shows the letter ы):
//   put the marker `lint-ignore-line` on the line, inside whatever comment the format allows:
//     MDX:       Russian writes <Uk>ы</Uk>. {/* lint-ignore-line russian-letter */}
//     Markdown:  <!-- lint-ignore-line -->
//     YAML:      notes: Russian ы  # lint-ignore-line russian-letter   (plain scalars only;
//                inside a | or > block scalar the marker would become part of the text)
//     Frontmatter: title: …  # lint-ignore-line
//   or `lint-ignore-next-line` on the line before (useful for headings and frontmatter).
//   Rule names after the marker (space or comma separated) limit it to those rules;
//   with no names, every rule is ignored on that line. JSON has no comments: put entries
//   that need an exception in a YAML file instead.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = join(ROOT, 'src', 'content');
const FIXTURE_DIR = join(ROOT, 'scripts', 'fixtures');
const EXTENSIONS = /\.(md|mdx|json|ya?ml)$/i;

const RULES = {
  'latin-in-cyrillic': 'error',
  'precomposed-stress': 'error',
  'stress-position': 'error',
  'double-stress': 'error',
  apostrophe: 'error',
  'stress-in-heading': 'error',
  'russian-letter': 'error',
  'unmarked-ukrainian': 'warning',
  'uk-en-dash': 'error',
};

const ACUTE = '́';
const CYR = /\p{Script=Cyrillic}/u;
const LAT = /\p{Script=Latin}/u;
const CYR_VOWELS = new Set('аеиіоуюяєїАЕИІОУЮЯЄЇ');
const RUSSIAN = /[ыэъёЫЭЪЁ]/gu;
// A word: letters and combining marks, joined by apostrophe variants.
const WORD = /[\p{L}\p{M}]+(?:['ʼ’][\p{L}\p{M}]+)*/gu;
const SPACED_EN_DASH = /(?<=\p{Script=Cyrillic}\p{M}*) – (?=\p{Script=Cyrillic})/gu;
const BAD_APOSTROPHE = /(?<=\p{Script=Cyrillic}\p{M}*)['ʼ](?=\p{Script=Cyrillic})/gu;
const hex = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const show = (ch) => `${ch} (${hex(ch)})`;

/** True for a precomposed letter carrying an acute or grave (á, é, ѐ, ѝ ...). */
function isPrecomposedAccent(ch) {
  const d = ch.normalize('NFD');
  return d.length > 1 && /[̀́]/.test(d);
}

// ---------------------------------------------------------------------------
// Masks: which characters of the file are code/comments (skipped by all rules)
// and, for MDX bodies, which are inside a Ukrainian-marked context.

/** Marks [start, end) in a boolean array. */
function fill(mask, start, end) {
  for (let i = start; i < end; i++) mask[i] = true;
}

/** Code fences, inline code, JSX and HTML comments, import/export lines. */
function codeMask(text, isMd, isMdx, bodyStart) {
  const mask = new Array(text.length).fill(false);
  if (!isMd) return mask;
  // Fenced code blocks.
  const fence = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]{0,3}\1[ \t]*$|(?![\s\S]))/gm;
  for (const m of text.slice(bodyStart).matchAll(fence)) fill(mask, bodyStart + m.index, bodyStart + m.index + m[0].length);
  // Inline code spans (single line).
  for (const m of text.slice(bodyStart).matchAll(/(`+)(?!`)[^\n]*?[^`]\1(?!`)|``/g)) {
    const s = bodyStart + m.index;
    if (!mask[s]) fill(mask, s, s + m[0].length);
  }
  for (const m of text.matchAll(/<!--[\s\S]*?-->/g)) fill(mask, m.index, m.index + m[0].length);
  if (isMdx) {
    for (const m of text.matchAll(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g)) fill(mask, m.index, m.index + m[0].length);
    for (const m of text.slice(bodyStart).matchAll(/^(?:import|export)\s[^\n]*$/gm))
      fill(mask, bodyStart + m.index, bodyStart + m.index + m[0].length);
  }
  return mask;
}

const UK_COMPONENTS = new Set(['Example', 'Uk', 'GrammarTable']);

/**
 * Scans a JSX/HTML tag starting at text[i] === '<'. Returns
 * { end, name, closing, selfClosing, attrs } or null if it is not a tag.
 * Handles quoted attribute values and {...} expressions of any depth.
 */
function scanTag(text, i) {
  const head = /^<(\/?)([A-Za-z][\w.-]*)/.exec(text.slice(i, i + 64));
  if (!head) return null;
  let j = i + head[0].length;
  let depth = 0;
  let quote = null;
  for (; j < text.length; j++) {
    const ch = text[j];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (depth > 0) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '"' || ch === "'" || ch === '`') {
        // String inside an expression.
        const close = text.indexOf(ch, j + 1);
        if (close === -1) return null;
        j = close;
      }
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '>') {
      const attrs = text.slice(i + head[0].length, j);
      return { end: j + 1, name: head[2], closing: head[1] === '/', selfClosing: /\/\s*$/.test(attrs), attrs };
    } else if (ch === '<' && depth === 0) return null;
  }
  return null;
}

/** Characters of an MDX body that are inside a Ukrainian-marked context. */
function ukMask(text, bodyStart, skip) {
  const mask = new Array(text.length).fill(false);
  const stack = []; // { name, uk }
  const inUk = () => stack.some((e) => e.uk);
  let i = bodyStart;
  while (i < text.length) {
    if (skip[i]) {
      if (inUk()) mask[i] = true;
      i++;
      continue;
    }
    if (text[i] === '<') {
      const tag = scanTag(text, i);
      if (tag) {
        const uk = UK_COMPONENTS.has(tag.name) || /\blang\s*=\s*["']uk(?:-[^"']*)?["']/.test(tag.attrs);
        if (tag.closing) {
          if (inUk()) fill(mask, i, tag.end);
          const k = stack.map((e) => e.name).lastIndexOf(tag.name);
          if (k !== -1) stack.length = k;
        } else {
          if (uk || inUk() || tag.name === 'ExampleList') fill(mask, i, tag.end);
          // Void HTML elements never close.
          if (!tag.selfClosing && !/^(br|hr|img|input|meta|link|wbr)$/i.test(tag.name)) stack.push({ name: tag.name, uk });
        }
        i = tag.end;
        continue;
      }
    }
    if (inUk()) mask[i] = true;
    i++;
  }
  // Markdown headings: the site wraps Cyrillic in headings with lang="uk" (Heading component).
  for (const m of text.slice(bodyStart).matchAll(/^ {0,3}#{1,6}(?:\s[^\n]*)?$/gm)) {
    if (!skip[bodyStart + m.index]) fill(mask, bodyStart + m.index, bodyStart + m.index + m[0].length);
  }
  // Markdown table rows.
  for (const m of text.slice(bodyStart).matchAll(/^[ \t]*\|[^\n]*$/gm)) fill(mask, bodyStart + m.index, bodyStart + m.index + m[0].length);
  return mask;
}

// ---------------------------------------------------------------------------

function parseIgnores(lines) {
  // Map line index -> Set of rules (empty set = all rules).
  const ignores = new Map();
  const add = (idx, rest) => {
    const names = (rest.match(/[a-z][a-z-]+/g) ?? []).filter((n) => n in RULES);
    const prev = ignores.get(idx);
    if (prev && prev.size === 0) return;
    ignores.set(idx, names.length ? new Set([...(prev ?? []), ...names]) : new Set());
  };
  lines.forEach((line, idx) => {
    const m = /lint-ignore-(next-)?line\b([^\n]*)/.exec(line);
    if (m) add(m[1] ? idx + 1 : idx, m[2].replace(/\*\/.*|-->.*/, ''));
  });
  return ignores;
}

/** Lints one file's text. Returns [{ line, col, rule, level, message }]. */
export function lintText(text, file) {
  const ext = file.toLowerCase().split('.').pop();
  const isMd = ext === 'md' || ext === 'mdx';
  const isMdx = ext === 'mdx';
  const isJson = ext === 'json';
  if (isJson) text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  text = text.replace(/\r\n?/g, '\n');

  // Frontmatter (Markdown) ends after the second --- line.
  let bodyStart = 0;
  let fmEnd = 0;
  if (isMd) {
    const fm = /^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/.exec(text);
    if (fm) bodyStart = fmEnd = fm[0].length;
  }
  const skip = codeMask(text, isMd, isMdx, bodyStart);
  const uk = isMdx ? ukMask(text, bodyStart, skip) : null;

  const lines = text.split('\n');
  const ignores = parseIgnores(lines);
  const problems = [];
  let offset = 0;

  lines.forEach((line, idx) => {
    const lineStart = offset;
    offset += line.length + 1;
    const ignored = ignores.get(idx);
    const report = (col, rule, message) => {
      if (ignored && (ignored.size === 0 || ignored.has(rule))) return;
      problems.push({ line: idx + 1, col: col + 1, rule, level: RULES[rule], message });
    };
    const live = (col) => !skip[lineStart + col];

    // Words.
    for (const m of line.matchAll(WORD)) {
      const word = m[0];
      if (!live(m.index)) continue;
      const chars = [...word];
      const hasCyr = chars.some((c) => CYR.test(c));
      let pos = m.index;
      let acutes = 0;
      let prev = '';
      for (const ch of chars) {
        if (ch === ACUTE) {
          acutes++;
          const latinOnly = !hasCyr && LAT.test(prev);
          if (!CYR_VOWELS.has(prev) && !latinOnly) {
            report(pos, 'stress-position', `U+0301 after ${prev ? show(prev) : 'nothing'} in "${word}"; it must follow a Cyrillic vowel`);
          }
        } else if (hasCyr && isPrecomposedAccent(ch)) {
          report(pos, 'precomposed-stress', `precomposed ${LAT.test(ch) ? 'Latin ' : ''}${show(ch)} in "${word}"; write the plain Cyrillic vowel + U+0301`);
        } else if (hasCyr && LAT.test(ch)) {
          report(pos, 'latin-in-cyrillic', `Latin ${show(ch)} in Cyrillic word "${word}"`);
        }
        if (!/\p{M}/u.test(ch)) prev = ch;
        pos += ch.length;
      }
      if (hasCyr && acutes > 1) report(m.index, 'double-stress', `${acutes} stress marks in "${word}"`);
    }

    for (const m of line.matchAll(BAD_APOSTROPHE)) {
      if (live(m.index)) report(m.index, 'apostrophe', `${show(m[0])} between Cyrillic letters; use ’ (U+2019)`);
    }

    if (uk) {
      for (const m of line.matchAll(SPACED_EN_DASH)) {
        if (live(m.index) && uk[lineStart + m.index + 1]) report(m.index + 1, 'uk-en-dash', 'spaced en dash (–) in Ukrainian text; use a spaced em dash (—)');
      }
    }

    for (const m of line.matchAll(RUSSIAN)) {
      if (live(m.index)) report(m.index, 'russian-letter', `${show(m[0])} is not a Ukrainian letter`);
    }

    // Headings.
    const inBody = lineStart >= bodyStart;
    const isHeading =
      (isMd && inBody && /^ {0,3}#{1,6}(?:\s|$)/.test(line) && live(0)) ||
      ((!isMd || lineStart < fmEnd) && /^\s*(?:-\s+)?["']?(?:title|term)["']?\s*:/.test(line));
    if (isHeading && line.includes(ACUTE)) {
      report(line.indexOf(ACUTE), 'stress-in-heading', 'stress mark in a heading, title or term (the heading font has no U+0301)');
    }

    // Unmarked Ukrainian in MDX prose.
    if (uk && inBody) {
      for (let c = 0; c < line.length; c++) {
        const k = lineStart + c;
        if (!skip[k] && !uk[k] && CYR.test(line[c])) {
          report(c, 'unmarked-ukrainian', 'Cyrillic text outside <Uk>, <Example>, <GrammarTable>, a table or lang="uk"');
          break;
        }
      }
    }
  });
  return problems.sort((a, b) => a.line - b.line || a.col - b.col);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTENSIONS.test(name)) out.push(p);
  }
  return out;
}

const isFixture = (p) => relative(CONTENT_DIR, p).split(sep).some((part) => part.startsWith('_fixture'));

function lintFiles(files) {
  const all = [];
  for (const file of files) {
    for (const p of lintText(readFileSync(file, 'utf8'), file)) all.push({ file: relative(ROOT, file).split(sep).join('/'), ...p });
  }
  return all;
}

function print(problems) {
  for (const p of problems) console.log(`${p.file}:${p.line}:${p.col}  ${p.level.padEnd(7)}  ${p.rule}  ${p.message}`);
}

/** Lines in a fixture carry `expect: rule[, rule]` comments; compare exactly. */
function selfTest() {
  let failed = 0;
  const check = (ok, msg) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`);
    if (!ok) failed++;
  };

  const badFile = join(FIXTURE_DIR, 'lint-bad.mdx');
  const bad = readFileSync(badFile, 'utf8').replace(/\r\n?/g, '\n');
  const expected = new Set();
  bad.split('\n').forEach((line, idx) => {
    const m = /expect:\s*([a-z, -]+)/.exec(line);
    if (m) for (const r of m[1].split(/[\s,]+/).filter(Boolean)) expected.add(`${idx + 1} ${r}`);
  });
  const found = lintFiles([badFile]);
  const got = new Set(found.map((p) => `${p.line} ${p.rule}`));
  for (const rule of Object.keys(RULES)) check(found.some((p) => p.rule === rule), `lint-bad.mdx: rule ${rule} fires`);
  const missing = [...expected].filter((e) => !got.has(e));
  const extra = [...got].filter((e) => !expected.has(e));
  check(missing.length === 0, `lint-bad.mdx: every expected problem reported${missing.length ? ` (missing: ${missing.join('; ')})` : ''}`);
  check(extra.length === 0, `lint-bad.mdx: no unexpected problems${extra.length ? ` (extra: ${extra.join('; ')})` : ''}`);
  if (missing.length || extra.length) print(found);

  for (const name of readdirSync(FIXTURE_DIR).filter((n) => n.startsWith('lint-clean'))) {
    const clean = lintFiles([join(FIXTURE_DIR, name)]);
    check(clean.length === 0, `${name}: no errors or warnings`);
    if (clean.length) print(clean);
  }
  console.log(failed ? `\nSelf-test failed (${failed}).` : '\nSelf-test passed.');
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();

const fileArgs = args.filter((a) => !a.startsWith('--'));
const files = fileArgs.length
  ? fileArgs.map((f) => resolve(f))
  : walk(CONTENT_DIR).filter((p) => args.includes('--fixtures') || !isFixture(p));

const problems = lintFiles(files);
print(problems);
const errors = problems.filter((p) => p.level === 'error').length;
const warnings = problems.length - errors;
console.log(`\nlint:content: ${files.length} files, ${errors} error(s), ${warnings} warning(s).`);
process.exit(errors ? 1 : 0);
