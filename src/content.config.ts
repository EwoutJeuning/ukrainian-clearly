import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { SECTIONS } from './lib/sections';
import { stripStress } from './lib/text';
import { exerciseSet } from './lib/exercises/schema';

/**
 * Content collections (Astro 7 Content Layer).
 *
 * Entry ids come from file paths relative to each `base`, without extension,
 * lowercased, nested folders kept: `src/content/articles/grammar/nouns.mdx`
 * has the id `grammar/nouns`. References (`reference('articles')`) use these
 * ids, e.g. `prerequisites: [alphabet/letters]`.
 */

const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: '**/*.{md,mdx}' }),
  schema: z.strictObject({
    title: z.string().min(1),
    description: z.string().min(1),
    section: z.enum(SECTIONS),
    order: z.number(),
    level: z.enum(['beginner', 'intermediate']),
    prerequisites: z.array(reference('articles')).default([]),
    related: z.array(reference('articles')).default([]),
    next: reference('articles').optional(),
    sources: z.array(reference('sources')).default([]),
    updated: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

const vocabularyEntry = z
  .strictObject({
    /** Ukrainian form, with stress marks (U+0301) where the site shows them. */
    uk: z.string().min(1),
    /** Unstressed form for search. Derived from `uk` when absent. */
    ukPlain: z.string().min(1).optional(),
    en: z.string().min(1),
    pos: z.enum(['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other']),
    gender: z.enum(['m', 'f', 'n']).optional(),
    plural: z.string().optional(),
    aspect: z.enum(['impf', 'pf']).optional(),
    aspectPair: z.string().optional(),
    notes: z.string().optional(),
  })
  .transform((entry) => ({ ...entry, ukPlain: entry.ukPlain ?? stripStress(entry.uk) }));

/** One theme per file: `src/content/vocabulary/<theme>.{json,yaml,yml}`. */
const vocabulary = defineCollection({
  loader: glob({ base: './src/content/vocabulary', pattern: '**/*.{json,yaml,yml}' }),
  schema: z.strictObject({
    title: z.string().min(1),
    description: z.string().min(1),
    order: z.number(),
    sources: z.array(reference('sources')).default([]),
    entries: z.array(vocabularyEntry).min(1),
    draft: z.boolean().default(false),
  }),
});

/**
 * One term per file. The file name is the term's id and its anchor on
 * /glossary/ (e.g. `grammatical-case.md` -> /glossary/#grammatical-case).
 * Prefer Markdown files: the body is the explanation. JSON/YAML entries may use
 * `explanation` instead, rendered as plain paragraphs (blank-line separated).
 */
const glossary = defineCollection({
  loader: glob({ base: './src/content/glossary', pattern: '**/*.{md,json,yaml,yml}' }),
  schema: z.strictObject({
    term: z.string().min(1),
    /** One sentence. */
    short: z.string().min(1),
    explanation: z.string().optional(),
    ukTerm: z.string().optional(),
    related: z.array(reference('articles')).default([]),
    seeAlso: z.array(reference('glossary')).default([]),
    draft: z.boolean().default(false),
  }),
});

/** Real references actually consulted: `src/content/sources/<id>.json`. */
const sources = defineCollection({
  loader: glob({ base: './src/content/sources', pattern: '**/*.json' }),
  schema: z.strictObject({
    title: z.string().min(1),
    author: z.string().optional(),
    publisher: z.string().optional(),
    url: z.url(),
    language: z.enum(['uk', 'en', 'mixed']),
    type: z.enum(['dictionary', 'orthography', 'grammar', 'legal', 'other']),
    accessed: z.iso.date(),
    usedFor: z.string().min(1),
    notes: z.string().optional(),
  }),
});

/** Practice sets: `src/content/exercises/<slug>.yaml`. Schema and rules: `src/lib/exercises/schema.ts`. */
const exercises = defineCollection({
  loader: glob({ base: './src/content/exercises', pattern: '**/*.{yaml,yml}' }),
  schema: exerciseSet,
});

export const collections = { articles, vocabulary, glossary, sources, exercises };
