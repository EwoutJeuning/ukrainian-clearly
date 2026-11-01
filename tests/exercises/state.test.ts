// Interaction states, summary and persistence (06_exercises-prompt, "Interaction states",
// "Required tests"; plan.md E5). Run: npm run test:exercises
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkQuestion, responseKey, type Response } from '../../src/lib/exercises/check.ts';
import {
  applyCheck,
  clearProgress,
  fingerprint,
  goTo,
  initialState,
  loadProgress,
  needsPractice,
  nextOpen,
  retryAll,
  retryNeedsPractice,
  reveal,
  saveProgress,
  showHint,
  storageKey,
  summarize,
  type SetState,
  type StorageLike,
} from '../../src/lib/exercises/state.ts';
import type { Question } from '../../src/lib/exercises/schema.ts';

const questions: Question[] = [
  {
    id: 'q1',
    type: 'choice',
    prompt: 'p',
    explanation: 'e',
    choiceLang: 'uk',
    choices: [
      { id: 'a', text: 'Так' },
      { id: 'b', text: 'Ні' },
    ],
    answer: 'a',
  },
  {
    id: 'q2',
    type: 'fill',
    prompt: 'p',
    explanation: 'e',
    text: '___!',
    translation: 'Bye!',
    answers: ['Бува́йте'],
    misses: [],
    checking: { ignoreCase: true, ignoreTerminalPunctuation: true, stressOptional: true },
  },
  {
    id: 'q3',
    type: 'choice',
    prompt: 'p',
    explanation: 'e',
    choiceLang: 'en',
    choices: [
      { id: 'a', text: 'yes' },
      { id: 'b', text: 'no' },
    ],
    answer: 'b',
  },
  {
    id: 'q4',
    type: 'choice',
    prompt: 'p',
    explanation: 'e',
    choiceLang: 'en',
    choices: [
      { id: 'a', text: 'yes' },
      { id: 'b', text: 'no' },
    ],
    answer: 'a',
  },
];

const q = (id: string) => questions.find((x) => x.id === id)!;
const submit = (s: SetState, id: string, r: Response) => applyCheck(s, id, checkQuestion(q(id), r), responseKey(q(id), r));

test('initial state: every question unanswered, on question 1', () => {
  const s = initialState(questions);
  assert.equal(s.current, 0);
  assert.equal(s.view, 'question');
  for (const x of questions) assert.deepEqual(s.questions[x.id], { status: 'unanswered', wrongAttempts: 0, hintShown: false });
});

test('correct on the first try', () => {
  const s = submit(initialState(questions), 'q1', 'a');
  assert.equal(s.questions.q1!.status, 'correct');
  assert.equal(s.questions.q1!.wrongAttempts, 0);
});

test('incorrect, then correct after retry', () => {
  let s = submit(initialState(questions), 'q1', 'b');
  assert.equal(s.questions.q1!.status, 'incorrect');
  assert.equal(s.questions.q1!.wrongAttempts, 1);
  s = submit(s, 'q1', 'a');
  assert.equal(s.questions.q1!.status, 'correct');
  assert.equal(s.questions.q1!.wrongAttempts, 1);
});

test('empty submission is not an attempt', () => {
  const s = submit(initialState(questions), 'q2', '   ');
  assert.equal(s.questions.q2!.status, 'unanswered');
  assert.equal(s.questions.q2!.wrongAttempts, 0);
});

test('resubmitting the same wrong answer is not counted twice', () => {
  let s = submit(initialState(questions), 'q2', 'бувай');
  s = submit(s, 'q2', ' Бува́й ');
  assert.equal(s.questions.q2!.wrongAttempts, 1);
  s = submit(s, 'q2', 'бувайй');
  assert.equal(s.questions.q2!.wrongAttempts, 2);
});

test('hint is recorded and does not change status', () => {
  const s = showHint(initialState(questions), 'q2');
  assert.equal(s.questions.q2!.hintShown, true);
  assert.equal(s.questions.q2!.status, 'unanswered');
});

test('reveal marks the question revealed, not correct, and locks it', () => {
  let s = reveal(submit(initialState(questions), 'q2', 'бувай'), 'q2');
  assert.equal(s.questions.q2!.status, 'revealed');
  s = submit(s, 'q2', 'бувайте');
  assert.equal(s.questions.q2!.status, 'revealed');
  assert.equal(showHint(s, 'q2'), s);
});

test('a correct question is locked against later checks and reveal', () => {
  let s = submit(initialState(questions), 'q1', 'a');
  s = submit(s, 'q1', 'b');
  s = reveal(s, 'q1');
  assert.equal(s.questions.q1!.status, 'correct');
  assert.equal(s.questions.q1!.wrongAttempts, 0);
});

test('navigation: next goes to the next open question, then the summary', () => {
  let s = initialState(questions);
  s = nextOpen(s, questions);
  assert.equal(s.current, 1);
  s = goTo(s, 3, questions.length);
  s = nextOpen(s, questions);
  assert.equal(s.view, 'summary');
});

test('summary distinguishes first try, after retry, revealed and open; counts hints', () => {
  let s = initialState(questions);
  s = submit(s, 'q1', 'a'); // first try
  s = submit(submit(s, 'q2', 'бувай'), 'q2', 'бувайте'); // after retry
  s = reveal(showHint(s, 'q3'), 'q3'); // revealed with a hint
  // q4 skipped
  const sum = summarize(s, questions);
  assert.equal(sum.total, 4);
  assert.equal(sum.firstTry, 1);
  assert.equal(sum.afterRetry, 1);
  assert.equal(sum.revealed, 1);
  assert.equal(sum.open, 1);
  assert.equal(sum.hintsUsed, 1);
  assert.equal(sum.complete, false);
  assert.deepEqual(sum.byOutcome, { 'first-try': ['q1'], 'after-retry': ['q2'], revealed: ['q3'], open: ['q4'] });
});

test('completed when every question is correct or revealed', () => {
  let s = initialState(questions);
  s = submit(s, 'q1', 'a');
  s = submit(s, 'q2', 'бувайте');
  s = submit(s, 'q3', 'b');
  s = reveal(s, 'q4');
  assert.equal(summarize(s, questions).complete, true);
});

test('retry needing practice resets only those questions and starts at the first', () => {
  let s = initialState(questions);
  s = submit(s, 'q1', 'a');
  s = submit(submit(s, 'q2', 'бувай'), 'q2', 'бувайте');
  s = submit(s, 'q3', 'b');
  s = reveal(s, 'q4');
  s = goTo(s, 4, questions.length);
  assert.deepEqual(needsPractice(s, questions), ['q2', 'q4']);
  s = retryNeedsPractice(s, questions);
  assert.equal(s.view, 'question');
  assert.equal(s.current, 1);
  assert.equal(s.questions.q1!.status, 'correct');
  assert.equal(s.questions.q2!.status, 'unanswered');
  assert.equal(s.questions.q3!.status, 'correct');
  assert.equal(s.questions.q4!.status, 'unanswered');
  // Next skips the settled q3.
  s = nextOpen(s, questions);
  assert.equal(s.current, 3);
});

test('retry all (and reset) starts fresh', () => {
  let s = submit(initialState(questions), 'q1', 'a');
  s = retryAll(questions);
  assert.deepEqual(s, initialState(questions));
});

// --- Persistence ----------------------------------------------------------

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem() {
    throw new Error('QuotaExceededError');
  }
  removeItem() {
    throw new Error('SecurityError');
  }
}

test('persistence: round trip', () => {
  const store = new MemoryStorage();
  let s = submit(initialState(questions), 'q1', 'a');
  s = showHint(s, 'q2');
  s = goTo(s, 1, questions.length);
  assert.equal(saveProgress(store, 'demo', questions, s), true);
  assert.deepEqual(loadProgress(store, 'demo', questions), s);
});

test('persistence: missing storage, failing storage and quota errors never throw', () => {
  const s = submit(initialState(questions), 'q1', 'a');
  assert.deepEqual(loadProgress(undefined, 'demo', questions), initialState(questions));
  assert.equal(saveProgress(undefined, 'demo', questions, s), false);
  assert.deepEqual(loadProgress(new BrokenStorage(), 'demo', questions), initialState(questions));
  assert.equal(saveProgress(new BrokenStorage(), 'demo', questions, s), false);
  assert.doesNotThrow(() => clearProgress(new BrokenStorage(), 'demo'));
});

test('persistence: corrupt JSON, wrong version and wrong shapes are ignored', () => {
  const store = new MemoryStorage();
  const fresh = initialState(questions);
  for (const raw of [
    '{not json',
    'null',
    '42',
    JSON.stringify({ v: 0, current: 1, view: 'question', q: {} }),
    JSON.stringify({ v: 1, current: 99, view: 'question', q: { q1: [fingerprint(q('q1')), { status: 'weird' }] } }),
    JSON.stringify({ v: 1, current: -1, view: 'x', q: { q1: 'nope' } }),
  ]) {
    store.setItem(storageKey('demo'), raw);
    assert.deepEqual(loadProgress(store, 'demo', questions), fresh, raw);
  }
});

test('persistence: changed or deleted questions drop their saved progress', () => {
  const store = new MemoryStorage();
  let s = submit(initialState(questions), 'q1', 'a');
  s = submit(s, 'q3', 'b');
  saveProgress(store, 'demo', questions, s);
  // q1's content changes; q3 is deleted; q5 is new.
  const changed: Question[] = [
    { ...q('q1'), explanation: 'a better explanation' } as Question,
    q('q2'),
    q('q4'),
    { ...q('q4'), id: 'q5' } as Question,
  ];
  const loaded = loadProgress(store, 'demo', changed);
  assert.equal(loaded.questions.q1!.status, 'unanswered');
  assert.equal(loaded.questions.q3, undefined);
  assert.equal(loaded.questions.q5!.status, 'unanswered');
});

test('persistence: clear removes saved progress', () => {
  const store = new MemoryStorage();
  saveProgress(store, 'demo', questions, submit(initialState(questions), 'q1', 'a'));
  clearProgress(store, 'demo');
  assert.equal(store.getItem(storageKey('demo')), null);
  assert.deepEqual(loadProgress(store, 'demo', questions), initialState(questions));
});
