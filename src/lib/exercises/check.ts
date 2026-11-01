/**
 * Answer checking and set progress for practice exercises (plan.md E3, E5).
 *
 * Pure and framework-free: no DOM, no Astro, no Svelte. The Svelte components
 * call these functions; tests run them directly with Node's test runner.
 * Imports use explicit .ts extensions so Node can run this file with type stripping.
 */
import { normalizeApostrophes, stripStress } from '../text.ts';
import type { ChoiceQuestion, FillQuestion, MatchQuestion, OrderQuestion, Question } from './schema.ts';

// ---------------------------------------------------------------------------
// Normalization

export interface CheckingPolicy {
  ignoreCase: boolean;
  ignoreTerminalPunctuation: boolean;
  stressOptional: boolean;
}

export const DEFAULT_POLICY: CheckingPolicy = { ignoreCase: true, ignoreTerminalPunctuation: true, stressOptional: true };

/** Apostrophe look-alikes learners type: ' ʼ ` ‘ ’ and the acute accent ´ used as one. */
const APOSTROPHES = /[`‘´]/g;
const TERMINAL_PUNCTUATION = /[\s.!?…]+$/u;

/**
 * Normalizes a typed answer (or an accepted answer) for comparison:
 * NFC, trimmed, inner whitespace collapsed, no space before punctuation,
 * apostrophe variants to U+2019; then, per policy, stress marks, case and final
 * . ! ? … removed. Letters are never merged: г/ґ, и/і, і/ї, е/є stay distinct.
 */
export function normalizeAnswer(text: string, policy: CheckingPolicy = DEFAULT_POLICY): string {
  let s = text.normalize('NFC').replace(/\s+/gu, ' ').trim();
  s = s.replace(/ (?=[,.!?…:;])/g, '');
  s = normalizeApostrophes(s.replace(APOSTROPHES, '’'));
  if (policy.stressOptional) s = stripStress(s);
  if (policy.ignoreTerminalPunctuation) s = s.replace(TERMINAL_PUNCTUATION, '');
  if (policy.ignoreCase) s = s.toLocaleLowerCase('uk');
  return s.normalize('NFC');
}

// ---------------------------------------------------------------------------
// Checking

/**
 * `empty`: nothing to check (not an attempt). `incomplete`: a word-order or
 * matching answer that does not use everything yet (not an attempt either).
 */
export type Verdict = 'empty' | 'incomplete' | 'correct' | 'incorrect';

export interface CheckResult {
  verdict: Verdict;
  /** Targeted feedback for this response (English, may contain Ukrainian words). */
  feedback?: string;
  /** Matching only: pair id -> whether the learner's choice for it is right. */
  pairs?: Record<string, boolean>;
}

export type ChoiceResponse = string | null;
export type FillResponse = string;
export type OrderResponse = string[];
/** Matching: left pair id -> chosen right pair id (or empty). */
export type MatchResponse = Record<string, string | null | undefined>;
export type Response = ChoiceResponse | FillResponse | OrderResponse | MatchResponse;

export function checkChoice(q: ChoiceQuestion, choiceId: ChoiceResponse): CheckResult {
  if (!choiceId) return { verdict: 'empty', feedback: 'Choose an answer first.' };
  if (choiceId === q.answer) return { verdict: 'correct' };
  const choice = q.choices.find((c) => c.id === choiceId);
  return { verdict: 'incorrect', ...(choice?.feedback ? { feedback: choice.feedback } : {}) };
}

/** Letter pairs learners confuse; each pair is a real distinction in Ukrainian. */
const LETTER_PAIRS: [string, string][] = [
  ['г', 'ґ'],
  ['и', 'і'],
  ['і', 'ї'],
  ['е', 'є'],
  ['и', 'й'],
];

const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

/** If a and b differ only by one confusable letter pair, returns that pair. */
export function confusedLetters(a: string, b: string): [string, string] | undefined {
  const x = [...a];
  const y = [...b];
  if (x.length !== y.length) return undefined;
  let found: [string, string] | undefined;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    const pair = LETTER_PAIRS.find(([p, q]) => (x[i] === p && y[i] === q) || (x[i] === q && y[i] === p));
    if (!pair || (found && found !== pair)) return undefined;
    found = pair;
  }
  return found;
}

/** Levenshtein distance, for "close, check the spelling" suggestions only. */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length]!;
}

export function checkFill(q: FillQuestion, input: FillResponse): CheckResult {
  const policy = q.checking;
  const given = normalizeAnswer(input, policy);
  if (given === '') return { verdict: 'empty', feedback: 'Type an answer first.' };
  const accepted = q.answers.map((a) => normalizeAnswer(a, policy));
  if (accepted.includes(given)) return { verdict: 'correct' };

  const miss = q.misses.find((m) => normalizeAnswer(m.answer, policy) === given);
  if (miss) return { verdict: 'incorrect', feedback: miss.feedback };

  if (LATIN.test(given) && accepted.some((a) => CYRILLIC.test(a) && !LATIN.test(a))) {
    return {
      verdict: 'incorrect',
      feedback:
        'Your answer contains Latin letters (for example i or a). Use Ukrainian letters: switch to a Ukrainian keyboard layout or use the letter buttons.',
    };
  }
  for (const a of accepted) {
    const pair = confusedLetters(given, a);
    if (pair) {
      return {
        verdict: 'incorrect',
        feedback: `Check the letters ${pair[0]} and ${pair[1]}: they are different letters in Ukrainian.`,
      };
    }
  }
  if (accepted.some((a) => editDistance(given, a) === 1)) {
    return { verdict: 'incorrect', feedback: 'Close, but not the expected form. Check each letter and the ending.' };
  }
  return { verdict: 'incorrect' };
}

/** Compares token texts, so repeated words with different ids are interchangeable. */
export function checkOrder(q: OrderQuestion, ids: OrderResponse): CheckResult {
  if (ids.length === 0) return { verdict: 'empty', feedback: 'Add words to build the sentence first.' };
  if (ids.length < q.tokens.length) {
    return { verdict: 'incomplete', feedback: 'Use every word: some are still in the word bank.' };
  }
  const text = new Map(q.tokens.map((t) => [t.id, normalizeAnswer(t.text)]));
  const key = (seq: string[]) => seq.map((id) => text.get(id) ?? `#${id}`).join(' ');
  const given = key(ids);
  return q.answers.some((a) => key(a) === given) ? { verdict: 'correct' } : { verdict: 'incorrect' };
}

/** Each pair is checked on its own; the question is correct when every pair is. */
export function checkMatch(q: MatchQuestion, chosen: MatchResponse): CheckResult {
  const filled = q.pairs.filter((p) => chosen[p.id]);
  if (filled.length === 0) return { verdict: 'empty', feedback: 'Choose a match for each item first.' };
  if (filled.length < q.pairs.length) {
    return { verdict: 'incomplete', feedback: 'Choose a match for every item before checking.' };
  }
  // Pairs whose texts are identical are interchangeable.
  const right = new Map(q.pairs.map((p) => [p.id, normalizeAnswer(p.right)]));
  const pairs: Record<string, boolean> = {};
  for (const p of q.pairs) pairs[p.id] = right.get(chosen[p.id] ?? '') === right.get(p.id);
  const wrong = Object.values(pairs).filter((ok) => !ok).length;
  if (wrong === 0) return { verdict: 'correct', pairs };
  return {
    verdict: 'incorrect',
    pairs,
    feedback: `${wrong} of ${q.pairs.length} ${q.pairs.length === 1 ? 'match is' : 'matches are'} not right yet. They are marked below.`,
  };
}

export function checkQuestion(q: Question, response: Response | undefined): CheckResult {
  switch (q.type) {
    case 'choice':
      return checkChoice(q, typeof response === 'string' ? response : null);
    case 'fill':
      return checkFill(q, typeof response === 'string' ? response : '');
    case 'order':
      return checkOrder(q, Array.isArray(response) ? response : []);
    case 'match':
      return checkMatch(q, response && typeof response === 'object' && !Array.isArray(response) ? response : {});
  }
}

/** A stable key for a response, used to ignore an unchanged resubmission. */
export function responseKey(q: Question, response: Response | undefined): string {
  if (q.type === 'fill') return normalizeAnswer(typeof response === 'string' ? response : '', q.checking);
  if (q.type === 'match') {
    const r = (response ?? {}) as MatchResponse;
    return q.pairs.map((p) => `${p.id}=${r[p.id] ?? ''}`).join('&');
  }
  return JSON.stringify(response ?? null);
}

/** The answer shown by "Show answer" (display form, with stress marks). */
export function displayAnswer(q: Question): string {
  switch (q.type) {
    case 'choice':
      return q.choices.find((c) => c.id === q.answer)?.text ?? '';
    case 'fill':
      return q.text.replace('___', q.answers[0] ?? '');
    case 'order': {
      const text = new Map(q.tokens.map((t) => [t.id, t.text]));
      return (q.answers[0] ?? []).map((id) => text.get(id) ?? '').join(' ');
    }
    case 'match':
      return q.pairs.map((p) => `${p.left} = ${p.right}`).join('; ');
  }
}
