// Content validation for src/content/exercises/*.yaml (06_exercises-prompt, "Required tests").
// The build already validates the Zod schema; these tests add cross-checks the schema
// cannot do: the answer key against the checker, draft exclusion, and links/anchors
// against the built site in dist/ (run `npm run build` first; those tests skip without dist/).
//
// These tests check consistency, not language correctness: the Ukrainian itself is
// verified against the sources listed in each set's `verification` record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { checkQuestion, normalizeAnswer } from '../../src/lib/exercises/check.ts';
import type { Question } from '../../src/lib/exercises/schema.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const SETS_DIR = join(ROOT, 'src', 'content', 'exercises');
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'index.html'));
const POLICY = { ignoreCase: true, ignoreTerminalPunctuation: true, stressOptional: true };

interface RawSet {
  title: string;
  status: 'draft' | 'verified';
  verification?: { date: string; method: string };
  prerequisites?: string[];
  related?: string[];
  sources: string[];
  questions: (Question & { checking?: Partial<typeof POLICY>; misses?: { answer: string; feedback: string }[] })[];
}

const files = readdirSync(SETS_DIR).filter((f) => /\.ya?ml$/.test(f));
const sets = files.map((f) => ({ id: f.replace(/\.ya?ml$/, ''), file: f, data: parse(readFileSync(join(SETS_DIR, f), 'utf8')) as RawSet }));

/** Questions with the schema defaults applied (checking, misses). */
const withDefaults = (q: RawSet['questions'][number]): Question =>
  (q.type === 'fill' ? { ...q, checking: { ...POLICY, ...q.checking }, misses: q.misses ?? [] } : q) as Question;

/** dist HTML file for a site path like /sentences/greetings/. */
const distFile = (path: string) => join(DIST, ...path.split('/').filter(Boolean), 'index.html');

const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

const idCache = new Map<string, Set<string>>();
function idsIn(file: string): Set<string> {
  let ids = idCache.get(file);
  if (!ids) {
    const html = readFileSync(file, 'utf8');
    ids = new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => decodeEntities(m[1]!)));
    idCache.set(file, ids);
  }
  return ids;
}

test('there is at least one exercise set', () => {
  assert.ok(sets.length > 0);
});

for (const { id, file, data } of sets) {
  test(`${file}: ids, explanations and verification record`, () => {
    assert.match(id, /^[a-z0-9][a-z0-9-]*$/);
    const seen = new Set<string>();
    for (const q of data.questions) {
      assert.ok(!seen.has(q.id), `duplicate question id ${q.id}`);
      seen.add(q.id);
      assert.ok(q.explanation?.trim(), `${q.id}: explanation required`);
    }
    if (data.status === 'verified') {
      assert.ok(data.verification?.method?.trim(), 'a verified set needs a verification method');
      assert.match(String(data.verification?.date), /^\d{4}-\d{2}-\d{2}$/);
    }
    for (const s of data.sources) assert.ok(existsSync(join(ROOT, 'src', 'content', 'sources', `${s}.json`)), `unknown source ${s}`);
  });

  test(`${file}: the answer key passes the checker; misses and distractors do not`, () => {
    for (const raw of data.questions) {
      const q = withDefaults(raw);
      switch (q.type) {
        case 'choice': {
          assert.ok(q.choices.some((c) => c.id === q.answer), `${q.id}: answer is not a choice id`);
          assert.equal(new Set(q.choices.map((c) => c.id)).size, q.choices.length, `${q.id}: duplicate choice ids`);
          assert.equal(checkQuestion(q, q.answer).verdict, 'correct');
          for (const c of q.choices.filter((c) => c.id !== q.answer)) {
            assert.equal(checkQuestion(q, c.id).verdict, 'incorrect', `${q.id}/${c.id}`);
            // A distractor must not read the same as the answer.
            assert.notEqual(normalizeAnswer(c.text), normalizeAnswer(q.choices.find((x) => x.id === q.answer)!.text), `${q.id}/${c.id}`);
          }
          break;
        }
        case 'fill': {
          for (const a of q.answers) assert.equal(checkQuestion(q, a).verdict, 'correct', `${q.id}: accepted "${a}"`);
          const accepted = new Set(q.answers.map((a) => normalizeAnswer(a, q.checking)));
          for (const m of q.misses) {
            assert.ok(!accepted.has(normalizeAnswer(m.answer, q.checking)), `${q.id}: miss "${m.answer}" equals an accepted answer`);
            const r = checkQuestion(q, m.answer);
            assert.equal(r.verdict, 'incorrect', `${q.id}: miss "${m.answer}"`);
            assert.equal(r.feedback, m.feedback, `${q.id}: miss "${m.answer}" gets its feedback`);
          }
          break;
        }
        case 'order': {
          const ids = q.tokens.map((t) => t.id);
          assert.equal(new Set(ids).size, ids.length, `${q.id}: duplicate token ids`);
          for (const a of q.answers) {
            assert.deepEqual([...a].sort(), [...ids].sort(), `${q.id}: an answer must use every token once`);
            assert.equal(checkQuestion(q, a).verdict, 'correct');
          }
          // The scrambled display order must not already be a correct answer.
          assert.notEqual(checkQuestion(q, ids).verdict, 'correct', `${q.id}: tokens are shown in a correct order`);
          break;
        }
        case 'match': {
          assert.deepEqual([...q.rightOrder].sort(), q.pairs.map((p) => p.id).sort(), `${q.id}: rightOrder`);
          const identity = Object.fromEntries(q.pairs.map((p) => [p.id, p.id]));
          assert.equal(checkQuestion(q, identity).verdict, 'correct');
          assert.notDeepEqual(q.rightOrder, q.pairs.map((p) => p.id), `${q.id}: right column is not scrambled`);
          break;
        }
      }
    }
  });

  test(`${file}: published only if verified`, { skip: !hasDist && 'no dist/ (run npm run build)' }, () => {
    const page = distFile(`/exercises/${id}/`);
    const hub = readFileSync(distFile('/exercises/'), 'utf8');
    if (data.status === 'verified') {
      assert.ok(existsSync(page), `missing ${page}`);
      assert.ok(hub.includes(`href="/exercises/${id}/"`), 'the hub links to the set');
    } else {
      assert.ok(!existsSync(page), `a draft set was built: ${page}`);
      assert.ok(!hub.includes(`href="/exercises/${id}/"`), 'the hub links to a draft set');
    }
  });

  test(`${file}: lesson links, prerequisites and related lessons resolve in the build`, { skip: !hasDist && 'no dist/ (run npm run build)' }, () => {
    for (const ref of [...(data.prerequisites ?? []), ...(data.related ?? [])]) {
      assert.ok(existsSync(distFile(`/${ref}/`)), `article ${ref} has no built page`);
    }
    for (const q of data.questions) {
      if (!q.lesson) continue;
      const url = new URL(q.lesson, 'http://x');
      const file = distFile(decodeURIComponent(url.pathname));
      assert.ok(existsSync(file), `${q.id}: no page for ${q.lesson}`);
      if (url.hash) {
        const anchor = decodeURIComponent(url.hash.slice(1));
        assert.ok(idsIn(file).has(anchor), `${q.id}: no id="${anchor}" in ${url.pathname}`);
      }
    }
  });
}
