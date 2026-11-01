import { reference } from 'astro:content';
import { z } from 'astro/zod';

/**
 * Exercise sets (plan.md, Exercises). One set per file:
 * `src/content/exercises/<slug>.yaml`; the file name is the set's id and URL
 * (`/exercises/<slug>/`). Ukrainian text carries stress marks (U+0301) where the
 * site shows them; answer checking treats stress as optional unless a question
 * says otherwise.
 *
 * Question ids must be unique within a set and must not change once published:
 * stored progress and feedback are keyed by them.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and hyphens');

/** A link to an explanation that exists on the site, e.g. `/grammar/genitive/#the-genitive-plural`. */
const sitePath = z.string().regex(/^\/[^\s]*$/, 'a site path starting with /');

/** How a typed answer is compared. Defaults suit most fill-in questions. */
const checking = z
  .strictObject({
    /** Capitals are not the learning objective. */
    ignoreCase: z.boolean().default(true),
    /** Final . ! ? … are not the learning objective. */
    ignoreTerminalPunctuation: z.boolean().default(true),
    /** Stress marks are optional in the learner's answer. Set false only when stress is tested. */
    stressOptional: z.boolean().default(true),
  })
  .default({ ignoreCase: true, ignoreTerminalPunctuation: true, stressOptional: true });

const questionBase = {
  id,
  /** The instruction, in English. May contain *emphasis*. */
  prompt: z.string().min(1),
  /** Why the answer is right (shown after checking or revealing). Required. */
  explanation: z.string().min(1),
  /** A nudge that does not give the answer away. */
  hint: z.string().min(1).optional(),
  /** The page section that explains this point. Must exist. */
  lesson: sitePath.optional(),
};

const choiceQuestion = z.strictObject({
  ...questionBase,
  type: z.literal('choice'),
  /** Optional Ukrainian context shown above the choices (a sentence, a dialogue line). */
  context: z.string().optional(),
  /** Language of the choice texts. */
  choiceLang: z.enum(['uk', 'en']),
  choices: z
    .array(
      z.strictObject({
        id,
        text: z.string().min(1),
        /** Shown when this wrong choice is picked: what it would mean, why it does not fit. */
        feedback: z.string().optional(),
      }),
    )
    .min(2)
    .max(5),
  /** Id of the one correct choice. */
  answer: id,
});

const fillQuestion = z.strictObject({
  ...questionBase,
  type: z.literal('fill'),
  /** Ukrainian sentence with exactly one blank written as `___`. */
  text: z.string().regex(/^(?:(?!___).)*___(?:(?!___).)*$/s, 'exactly one ___ blank'),
  /** English translation of the whole sentence, so the expected form is identifiable. */
  translation: z.string().min(1),
  /** Base form or other cue shown next to the blank, e.g. `(кни́га)`. */
  cue: z.string().optional(),
  /** Accepted answers; the first is the display form. Every entry must be verified. */
  answers: z.array(z.string().min(1)).min(1),
  /** Known wrong answers with targeted feedback (e.g. the nominative instead of the genitive). */
  misses: z.array(z.strictObject({ answer: z.string().min(1), feedback: z.string().min(1) })).default([]),
  checking,
});

const orderQuestion = z.strictObject({
  ...questionBase,
  type: z.literal('order'),
  /** English meaning of the sentence to build. */
  translation: z.string().min(1),
  /** Tokens in a fixed, deliberately scrambled display order. Repeated words get separate ids. */
  tokens: z.array(z.strictObject({ id, text: z.string().min(1) })).min(2).max(10),
  /** Every verified correct order, as token ids. Must each use every token exactly once. */
  answers: z.array(z.array(id).min(2)).min(1),
});

const matchQuestion = z.strictObject({
  ...questionBase,
  type: z.literal('match'),
  /** Left column (Ukrainian), right column (English or a related form). */
  leftLang: z.enum(['uk', 'en']),
  rightLang: z.enum(['uk', 'en']),
  /** Pairs as authored; the right column is shown in `rightOrder`. 3–6 pairs. */
  pairs: z.array(z.strictObject({ id, left: z.string().min(1), right: z.string().min(1) })).min(3).max(6),
  /** Display order of the right column, as pair ids (a fixed permutation, not random). */
  rightOrder: z.array(id).min(3).max(6),
});

export const question = z.discriminatedUnion('type', [choiceQuestion, fillQuestion, orderQuestion, matchQuestion]);

export const exerciseSet = z
  .strictObject({
    title: z.string().min(1),
    /** Unique meta description. */
    description: z.string().min(1),
    order: z.number(),
    level: z.enum(['beginner', 'intermediate']),
    /** Short topic label for the hub, e.g. "Greetings". */
    topic: z.string().min(1),
    /** What the learner practises, one sentence, shown before the set. */
    objective: z.string().min(1),
    /** Lessons to read first. */
    prerequisites: z.array(reference('articles')).default([]),
    related: z.array(reference('articles')).default([]),
    sources: z.array(reference('sources')).min(1),
    /**
     * Editorial status. Only `verified` sets are built as public pages.
     * `verified` means every Ukrainian form and answer was checked against the sources
     * listed in `verification` (not a native-speaker or expert review).
     */
    status: z.enum(['draft', 'verified']),
    verification: z
      .strictObject({
        date: z.iso.date(),
        /** What was checked and against what (e.g. "stress: Горох paradigms; cases: Pravopys §82"). */
        method: z.string().min(1),
        /** Open doubts; a verified set should normally have none. */
        gaps: z.array(z.string()).default([]),
      })
      .optional(),
    questions: z.array(question).min(3).max(10),
  })
  .superRefine((set, ctx) => {
    const seen = new Set<string>();
    set.questions.forEach((q, i) => {
      if (seen.has(q.id)) ctx.addIssue({ code: 'custom', path: ['questions', i, 'id'], message: `duplicate question id ${q.id}` });
      seen.add(q.id);
      if (q.type === 'choice' && !q.choices.some((c) => c.id === q.answer))
        ctx.addIssue({ code: 'custom', path: ['questions', i, 'answer'], message: 'answer is not one of the choice ids' });
      if (q.type === 'order') {
        const ids = q.tokens.map((t) => t.id).sort().join(' ');
        q.answers.forEach((a, j) => {
          if ([...a].sort().join(' ') !== ids)
            ctx.addIssue({ code: 'custom', path: ['questions', i, 'answers', j], message: 'an answer must use every token exactly once' });
        });
      }
      if (q.type === 'match') {
        const ids = q.pairs.map((p) => p.id).sort().join(' ');
        if ([...q.rightOrder].sort().join(' ') !== ids)
          ctx.addIssue({ code: 'custom', path: ['questions', i, 'rightOrder'], message: 'rightOrder must be a permutation of the pair ids' });
      }
    });
    if (set.status === 'verified' && !set.verification)
      ctx.addIssue({ code: 'custom', path: ['verification'], message: 'a verified set needs a verification record' });
  });

export type ExerciseSet = z.infer<typeof exerciseSet>;
export type Question = z.infer<typeof question>;
export type ChoiceQuestion = Extract<Question, { type: 'choice' }>;
export type FillQuestion = Extract<Question, { type: 'fill' }>;
export type OrderQuestion = Extract<Question, { type: 'order' }>;
export type MatchQuestion = Extract<Question, { type: 'match' }>;
