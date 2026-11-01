/**
 * Progress through one exercise set: state transitions, the summary, and
 * optional localStorage persistence (plan.md E5). Pure and framework-free.
 *
 * Question states:
 *   unanswered  nothing checked yet (or reset)
 *   incorrect   checked at least once, last check wrong; the learner may try again
 *   correct     answered correctly (first try or after retries)
 *   revealed    "Show answer" used before a correct answer; never counted as correct
 * A hint can be shown in any open state and is recorded.
 * The set is complete when every question is correct or revealed.
 */
import type { Question } from './schema.ts';
import type { CheckResult } from './check.ts';

export type QuestionStatus = 'unanswered' | 'incorrect' | 'correct' | 'revealed';

export interface QuestionState {
  status: QuestionStatus;
  /** Substantive wrong checks (empty, incomplete and unchanged resubmissions excluded). */
  wrongAttempts: number;
  hintShown: boolean;
  /** Response key of the last wrong check, so resubmitting it is not counted again. */
  lastWrong?: string | undefined;
}

export interface SetState {
  /** Index of the question on screen. */
  current: number;
  /** 'summary' once the learner moves past the last question. */
  view: 'question' | 'summary';
  questions: Record<string, QuestionState>;
}

export const freshQuestion = (): QuestionState => ({ status: 'unanswered', wrongAttempts: 0, hintShown: false });

export function initialState(questions: Pick<Question, 'id'>[]): SetState {
  return { current: 0, view: 'question', questions: Object.fromEntries(questions.map((q) => [q.id, freshQuestion()])) };
}

export const isSettled = (q: QuestionState | undefined) => q?.status === 'correct' || q?.status === 'revealed';

function update(state: SetState, id: string, change: (q: QuestionState) => QuestionState): SetState {
  const q = state.questions[id] ?? freshQuestion();
  return { ...state, questions: { ...state.questions, [id]: change(q) } };
}

/** Records a check. Empty or incomplete responses, and settled questions, change nothing. */
export function applyCheck(state: SetState, id: string, result: CheckResult, key: string): SetState {
  if (isSettled(state.questions[id])) return state;
  if (result.verdict === 'correct') {
    return update(state, id, ({ wrongAttempts, hintShown }) => ({ status: 'correct', wrongAttempts, hintShown }));
  }
  if (result.verdict === 'incorrect') {
    return update(state, id, (q) =>
      q.lastWrong === key ? q : { ...q, status: 'incorrect', wrongAttempts: q.wrongAttempts + 1, lastWrong: key },
    );
  }
  return state;
}

export function showHint(state: SetState, id: string): SetState {
  if (isSettled(state.questions[id])) return state;
  return update(state, id, (q) => ({ ...q, hintShown: true }));
}

export function reveal(state: SetState, id: string): SetState {
  if (isSettled(state.questions[id])) return state;
  return update(state, id, (q) => ({ ...q, status: 'revealed' }));
}

export function goTo(state: SetState, index: number, total: number): SetState {
  if (index >= total) return { ...state, view: 'summary' };
  return { ...state, view: 'question', current: Math.max(0, index) };
}

export const next = (state: SetState, total: number) => goTo(state, state.current + 1, total);

/** Retry the whole set from question 1. */
export const retryAll = (questions: Pick<Question, 'id'>[]): SetState => initialState(questions);

export type Outcome = 'first-try' | 'after-retry' | 'revealed' | 'open';

export function outcome(q: QuestionState | undefined): Outcome {
  if (!q) return 'open';
  if (q.status === 'revealed') return 'revealed';
  if (q.status === 'correct') return q.wrongAttempts === 0 ? 'first-try' : 'after-retry';
  return 'open';
}

/** Questions to practise again: everything not answered right on the first try. */
export function needsPractice(state: SetState, questions: Pick<Question, 'id'>[]): string[] {
  return questions.map((q) => q.id).filter((id) => outcome(state.questions[id]) !== 'first-try');
}

/** Resets only the questions needing practice and goes to the first of them. */
export function retryNeedsPractice(state: SetState, questions: Pick<Question, 'id'>[]): SetState {
  const ids = new Set(needsPractice(state, questions));
  if (ids.size === 0) return state;
  const qs = { ...state.questions };
  for (const id of ids) qs[id] = freshQuestion();
  const first = questions.findIndex((q) => ids.has(q.id));
  return { current: first, view: 'question', questions: qs };
}

/** In "practise again" mode, the next question still to do after `from`, or the summary. */
export function nextOpen(state: SetState, questions: Pick<Question, 'id'>[]): SetState {
  for (let i = state.current + 1; i < questions.length; i++) {
    if (!isSettled(state.questions[questions[i]!.id])) return goTo(state, i, questions.length);
  }
  return goTo(state, questions.length, questions.length);
}

export interface Summary {
  total: number;
  firstTry: number;
  afterRetry: number;
  revealed: number;
  open: number;
  hintsUsed: number;
  complete: boolean;
  byOutcome: Record<Outcome, string[]>;
}

export function summarize(state: SetState, questions: Pick<Question, 'id'>[]): Summary {
  const byOutcome: Record<Outcome, string[]> = { 'first-try': [], 'after-retry': [], revealed: [], open: [] };
  let hintsUsed = 0;
  for (const { id } of questions) {
    const q = state.questions[id];
    byOutcome[outcome(q)].push(id);
    if (q?.hintShown) hintsUsed++;
  }
  return {
    total: questions.length,
    firstTry: byOutcome['first-try'].length,
    afterRetry: byOutcome['after-retry'].length,
    revealed: byOutcome.revealed.length,
    open: byOutcome.open.length,
    hintsUsed,
    complete: byOutcome.open.length === 0,
    byOutcome,
  };
}

// ---------------------------------------------------------------------------
// Persistence (optional; this browser only)

export const STORAGE_VERSION = 1;
export const storageKey = (setId: string) => `ukrainian-clearly:exercises:v${STORAGE_VERSION}:${setId}`;

/** The subset of the Web Storage API used here, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Stored {
  v: number;
  current: number;
  view: 'question' | 'summary';
  /** Question id -> [fingerprint, state]. */
  q: Record<string, [string, QuestionState]>;
}

/**
 * A fingerprint of a question's content. Stored progress for a question whose
 * content changed (or that was deleted) is dropped.
 */
export function fingerprint(q: Question): string {
  const s = JSON.stringify(q);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** localStorage when it exists and works; undefined otherwise (private mode, blocked, SSR). */
export function browserStorage(): StorageLike | undefined {
  try {
    const s = globalThis.localStorage;
    if (!s) return undefined;
    const probe = '__uc_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return undefined;
  }
}

const STATUSES: QuestionStatus[] = ['unanswered', 'incorrect', 'correct', 'revealed'];

function validQuestionState(x: unknown): x is QuestionState {
  if (!x || typeof x !== 'object') return false;
  const q = x as Record<string, unknown>;
  return (
    STATUSES.includes(q.status as QuestionStatus) &&
    Number.isInteger(q.wrongAttempts) &&
    (q.wrongAttempts as number) >= 0 &&
    typeof q.hintShown === 'boolean' &&
    (q.lastWrong === undefined || typeof q.lastWrong === 'string')
  );
}

/**
 * Loads saved progress. Anything missing, corrupt, from another version, or
 * for changed/deleted questions is ignored; storage errors never throw.
 */
export function loadProgress(storage: StorageLike | undefined, setId: string, questions: Question[]): SetState {
  const state = initialState(questions);
  if (!storage) return state;
  let raw: string | null;
  try {
    raw = storage.getItem(storageKey(setId));
  } catch {
    return state;
  }
  if (!raw) return state;
  let data: Stored;
  try {
    data = JSON.parse(raw) as Stored;
  } catch {
    return state;
  }
  if (!data || typeof data !== 'object' || data.v !== STORAGE_VERSION || !data.q || typeof data.q !== 'object') return state;
  for (const q of questions) {
    const entry = data.q[q.id];
    if (Array.isArray(entry) && entry[0] === fingerprint(q) && validQuestionState(entry[1])) {
      const { status, wrongAttempts, hintShown, lastWrong } = entry[1];
      state.questions[q.id] = { status, wrongAttempts, hintShown, ...(lastWrong ? { lastWrong } : {}) };
    }
  }
  if (Number.isInteger(data.current) && data.current >= 0 && data.current < questions.length) state.current = data.current;
  if (data.view === 'summary') state.view = 'summary';
  return state;
}

/** Saves progress; returns false if storage is unavailable or full. */
export function saveProgress(storage: StorageLike | undefined, setId: string, questions: Question[], state: SetState): boolean {
  if (!storage) return false;
  const data: Stored = { v: STORAGE_VERSION, current: state.current, view: state.view, q: {} };
  for (const q of questions) {
    const s = state.questions[q.id];
    if (s) data.q[q.id] = [fingerprint(q), s];
  }
  try {
    storage.setItem(storageKey(setId), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(storage: StorageLike | undefined, setId: string): void {
  try {
    storage?.removeItem(storageKey(setId));
  } catch {
    // Unavailable storage: nothing to clear.
  }
}
