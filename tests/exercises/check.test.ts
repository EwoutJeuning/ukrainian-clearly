// Answer checking (06_exercises-prompt, "Answer checking"; plan.md E3).
// Run: npm run test:exercises
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkChoice,
  checkFill,
  checkMatch,
  checkOrder,
  checkQuestion,
  confusedLetters,
  displayAnswer,
  normalizeAnswer,
  responseKey,
} from '../../src/lib/exercises/check.ts';
import type { ChoiceQuestion, FillQuestion, MatchQuestion, OrderQuestion } from '../../src/lib/exercises/schema.ts';

const policy = { ignoreCase: true, ignoreTerminalPunctuation: true, stressOptional: true };

function fill(over: Partial<FillQuestion> = {}): FillQuestion {
  return {
    id: 'f',
    type: 'fill',
    prompt: 'p',
    explanation: 'e',
    text: 'Як ся ___?',
    translation: 'How are you?',
    answers: ['ма́єте'],
    misses: [{ answer: 'ма́єш', feedback: 'ти form' }],
    checking: { ...policy },
    ...over,
  };
}

const choice: ChoiceQuestion = {
  id: 'c',
  type: 'choice',
  prompt: 'p',
  explanation: 'e',
  choiceLang: 'uk',
  choices: [
    { id: 'a', text: 'Приві́т!' },
    { id: 'b', text: 'На добра́ніч!', feedback: 'That is a goodbye.' },
    { id: 'c', text: 'Віта́ю!' },
  ],
  answer: 'a',
};

const order: OrderQuestion = {
  id: 'o',
  type: 'order',
  prompt: 'p',
  explanation: 'e',
  translation: 'Good day, good day!',
  // Repeated words get separate ids.
  tokens: [
    { id: 'day2', text: 'день!' },
    { id: 'good1', text: 'До́брий' },
    { id: 'day1', text: 'день,' },
    { id: 'good2', text: 'до́брий' },
  ],
  answers: [['good1', 'day1', 'good2', 'day2']],
};

const match: MatchQuestion = {
  id: 'm',
  type: 'match',
  prompt: 'p',
  explanation: 'e',
  leftLang: 'uk',
  rightLang: 'en',
  pairs: [
    { id: 'morning', left: 'До́брий ра́нок!', right: 'Good morning!' },
    { id: 'evening', left: 'До́брий ве́чір!', right: 'Good evening!' },
    { id: 'night', left: 'На добра́ніч!', right: 'Good night!' },
  ],
  rightOrder: ['night', 'morning', 'evening'],
};

test('normalize: NFC, trim, collapse spaces, space before punctuation', () => {
  assert.equal(normalizeAnswer('  До́бре ,   дя́кую  '), 'добре, дякую');
  // и + U+0306 (decomposed й) equals precomposed й after NFC.
  assert.equal(normalizeAnswer('мой'), normalizeAnswer('мой'));
});

test('normalize: apostrophe variants become U+2019', () => {
  for (const v of ["м'ята", 'мʼята', 'м’ята', 'м`ята', 'м‘ята']) assert.equal(normalizeAnswer(v), 'м’ята');
});

test('normalize: stress optional by default, kept when stress is tested', () => {
  assert.equal(normalizeAnswer('ма́єте'), 'маєте');
  assert.equal(normalizeAnswer('ма́єте', { ...policy, stressOptional: false }), 'ма́єте');
});

test('normalize: case and terminal punctuation per policy', () => {
  assert.equal(normalizeAnswer('Добрий день!'), 'добрий день');
  assert.equal(normalizeAnswer('Добрий день!', { ...policy, ignoreCase: false }), 'Добрий день');
  assert.equal(normalizeAnswer('Добрий день!', { ...policy, ignoreTerminalPunctuation: false }), 'добрий день!');
  assert.equal(normalizeAnswer('Так собі…'), 'так собі');
  // Only terminal punctuation goes; inner commas stay.
  assert.equal(normalizeAnswer('Добре, дякую.'), 'добре, дякую');
});

test('normalize: meaningful letters stay distinct', () => {
  const pairs = [
    ['ґанок', 'ганок'],
    ['кит', 'кіт'],
    ['її', 'іі'],
    ['моє', 'мое'],
  ];
  for (const [a, b] of pairs) assert.notEqual(normalizeAnswer(a!), normalizeAnswer(b!));
});

test('fill: accepted answer with and without stress, any case, extra spaces', () => {
  for (const s of ['ма́єте', 'маєте', ' МАЄТЕ ', 'Маєте?']) assert.equal(checkFill(fill(), s).verdict, 'correct', s);
});

test('fill: stress required when the question tests stress', () => {
  const q = fill({ checking: { ...policy, stressOptional: false } });
  assert.equal(checkFill(q, 'ма́єте').verdict, 'correct');
  assert.equal(checkFill(q, 'маєте').verdict, 'incorrect');
  assert.equal(checkFill(q, 'має́те').verdict, 'incorrect');
});

test('fill: case and punctuation count when they are the objective', () => {
  const q = fill({ answers: ['Київ'], misses: [], checking: { ...policy, ignoreCase: false } });
  assert.equal(checkFill(q, 'Київ').verdict, 'correct');
  assert.equal(checkFill(q, 'київ').verdict, 'incorrect');
  const p = fill({ answers: ['Так?'], misses: [], checking: { ...policy, ignoreTerminalPunctuation: false } });
  assert.equal(checkFill(p, 'так?').verdict, 'correct');
  assert.equal(checkFill(p, 'так').verdict, 'incorrect');
});

test('fill: alternate accepted answers', () => {
  const q = fill({ answers: ['у', 'в'], misses: [] });
  assert.equal(checkFill(q, 'у').verdict, 'correct');
  assert.equal(checkFill(q, 'в').verdict, 'correct');
});

test('fill: empty input is "empty", not wrong', () => {
  for (const s of ['', '   ', '\t\n', '.', '!']) assert.equal(checkFill(fill(), s).verdict, 'empty', JSON.stringify(s));
});

test('fill: misses give targeted feedback and stay wrong', () => {
  const r = checkFill(fill(), 'маєш');
  assert.equal(r.verdict, 'incorrect');
  assert.equal(r.feedback, 'ти form');
});

test('fill: misses use the same normalization as accepted answers', () => {
  // Misses written without stress, in lower case, without punctuation, with a plain apostrophe.
  const q = fill({
    answers: ['ка́ву'],
    misses: [
      { answer: 'кава', feedback: 'nominative' },
      { answer: "м'ята", feedback: 'apostrophe miss' },
    ],
  });
  for (const s of ['ка́ва', 'Кава!', ' КА́ВА ']) assert.equal(checkFill(q, s).feedback, 'nominative', s);
  for (const s of ['м’ята', 'мʼята', 'М`ята.']) assert.equal(checkFill(q, s).feedback, 'apostrophe miss', s);
  assert.equal(checkFill(q, 'кава').verdict, 'incorrect');
});

test('fill: confusable letters are wrong, with a letter hint', () => {
  const q = fill({ answers: ['ґанок'], misses: [] });
  const r = checkFill(q, 'ганок');
  assert.equal(r.verdict, 'incorrect');
  assert.match(r.feedback ?? '', /г and ґ/);
  assert.deepEqual(confusedLetters('кит', 'кіт'), ['и', 'і']);
  assert.deepEqual(confusedLetters('іі', 'її'), ['і', 'ї']);
  assert.deepEqual(confusedLetters('мое', 'моє'), ['е', 'є']);
  assert.equal(confusedLetters('кот', 'кіт'), undefined);
});

test('fill: a similar-looking different form is not accepted (typo is only a suggestion)', () => {
  const q = fill({ answers: ['до́брий'], misses: [] });
  const r = checkFill(q, 'добра');
  assert.equal(r.verdict, 'incorrect');
  const near = checkFill(q, 'добрийй');
  assert.equal(near.verdict, 'incorrect');
  assert.match(near.feedback ?? '', /Close/);
});

test('fill: Latin look-alike letters are flagged, not accepted', () => {
  const q = fill({ answers: ['віта́ю'], misses: [] });
  const r = checkFill(q, 'вiтаю'); // Latin i
  assert.equal(r.verdict, 'incorrect');
  assert.match(r.feedback ?? '', /Latin/);
});

test('choice: correct, wrong with feedback, and empty', () => {
  assert.equal(checkChoice(choice, 'a').verdict, 'correct');
  const wrong = checkChoice(choice, 'b');
  assert.equal(wrong.verdict, 'incorrect');
  assert.equal(wrong.feedback, 'That is a goodbye.');
  assert.equal(checkChoice(choice, null).verdict, 'empty');
});

test('choice: correctness is by id, so shuffled display order does not matter', () => {
  const shuffled: ChoiceQuestion = { ...choice, choices: [...choice.choices].reverse() };
  assert.equal(checkChoice(shuffled, 'a').verdict, 'correct');
  assert.equal(checkChoice(shuffled, 'c').verdict, 'incorrect');
});

test('order: verified sequence is correct; repeated words are interchangeable', () => {
  assert.equal(checkOrder(order, ['good1', 'day1', 'good2', 'day2']).verdict, 'correct');
  // "до́брий" and "До́брий" differ only in case, so swapping them is the same sentence.
  assert.equal(checkOrder(order, ['good2', 'day1', 'good1', 'day2']).verdict, 'correct');
  assert.equal(checkOrder(order, ['good1', 'day2', 'good2', 'day1']).verdict, 'incorrect');
});

test('order: empty and incomplete are not attempts', () => {
  assert.equal(checkOrder(order, []).verdict, 'empty');
  assert.equal(checkOrder(order, ['good1', 'day1']).verdict, 'incomplete');
});

test('order: alternative verified orders are all accepted', () => {
  const q: OrderQuestion = {
    ...order,
    tokens: [
      { id: 'a', text: 'А' },
      { id: 'b', text: 'Б' },
    ],
    answers: [
      ['a', 'b'],
      ['b', 'a'],
    ],
  };
  assert.equal(checkOrder(q, ['a', 'b']).verdict, 'correct');
  assert.equal(checkOrder(q, ['b', 'a']).verdict, 'correct');
});

test('match: checked per pair, independent of display order', () => {
  const all = checkMatch(match, { morning: 'morning', evening: 'evening', night: 'night' });
  assert.equal(all.verdict, 'correct');
  const one = checkMatch(match, { morning: 'evening', evening: 'morning', night: 'night' });
  assert.equal(one.verdict, 'incorrect');
  assert.deepEqual(one.pairs, { morning: false, evening: false, night: true });
  assert.match(one.feedback ?? '', /2 of 3/);
});

test('match: empty and incomplete are not attempts', () => {
  assert.equal(checkMatch(match, {}).verdict, 'empty');
  assert.equal(checkMatch(match, { morning: 'morning' }).verdict, 'incomplete');
});

test('checkQuestion dispatches by type and tolerates wrong response shapes', () => {
  assert.equal(checkQuestion(choice, 'a').verdict, 'correct');
  assert.equal(checkQuestion(fill(), ['x']).verdict, 'empty');
  assert.equal(checkQuestion(order, 'x').verdict, 'empty');
  assert.equal(checkQuestion(match, undefined).verdict, 'empty');
});

test('responseKey: normalized for fill, stable for match', () => {
  assert.equal(responseKey(fill(), ' Маєш '), responseKey(fill(), 'ма́єш'));
  assert.equal(responseKey(match, { night: 'night', morning: 'x' }), responseKey(match, { morning: 'x', night: 'night' }));
});

test('displayAnswer keeps stress marks and fills the blank', () => {
  assert.equal(displayAnswer(fill()), 'Як ся ма́єте?');
  assert.equal(displayAnswer(choice), 'Приві́т!');
  assert.equal(displayAnswer(order), 'До́брий день, до́брий день!');
});
