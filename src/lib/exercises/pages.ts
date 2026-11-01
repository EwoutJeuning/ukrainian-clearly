/** Helpers for the exercise pages (Astro only; uses content collections). */
import { articleUrl, getArticles, getAvailableSections, getGlossaryTerms, getVocabularyThemes, vocabularyUrl } from '../content';
import { sectionPath } from '../sections';
import type { Question } from './schema';

/** Page paths (no #anchor) that a question's `lesson` may point to. */
export async function exerciseSitePaths(): Promise<Set<string>> {
  const paths = new Set<string>();
  for (const a of await getArticles()) paths.add(articleUrl(a));
  for (const t of await getVocabularyThemes()) paths.add(vocabularyUrl(t));
  for (const s of await getAvailableSections()) paths.add(sectionPath(s));
  if ((await getGlossaryTerms()).length > 0) paths.add('/glossary/');
  return paths;
}

export const levelLabel = (level: 'beginner' | 'intermediate') => (level === 'beginner' ? 'Beginner' : 'Intermediate');

const TYPE_LABELS: Record<Question['type'], string> = {
  choice: 'multiple choice',
  fill: 'fill in the blank',
  order: 'word order',
  match: 'matching',
};

/** "multiple choice, matching and word order", in order of first appearance. */
export function questionTypeLabels(questions: Pick<Question, 'type'>[]): string {
  const labels = [...new Set(questions.map((q) => TYPE_LABELS[q.type]))];
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}
