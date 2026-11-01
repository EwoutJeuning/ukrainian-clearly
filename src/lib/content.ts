import { getCollection, type CollectionEntry } from 'astro:content';
import { SECTIONS, SECTION_INFO, type SectionId } from './sections';

export type Article = CollectionEntry<'articles'>;
export type VocabularyTheme = CollectionEntry<'vocabulary'>;
export type GlossaryTerm = CollectionEntry<'glossary'>;
export type Source = CollectionEntry<'sources'>;

interface Ref<C extends string> {
  collection: C;
  id: string;
}

/** Drafts render in `astro dev` only; production builds exclude them. */
const isPublished = (entry: { data: { draft?: boolean } }) => import.meta.env.DEV || !entry.data.draft;

const byOrderThenTitle = (
  a: { data: { order: number; title: string } },
  b: { data: { order: number; title: string } },
) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title, 'en');

/** Last path segment of an article id: `grammar/nouns` -> `nouns`. */
export function articleSlug(article: Article): string {
  return article.id.split('/').pop() ?? article.id;
}

/**
 * An article whose file is named `index` is its section's landing page.
 * The glob loader drops a trailing `/index` from ids (`grammar/index.mdx` gets
 * the id `grammar`), so check the file path, not the id.
 */
export function isSectionIndex(article: Article): boolean {
  if (article.filePath) return /(^|\/)index\.mdx?$/.test(article.filePath);
  return article.id === article.data.section || articleSlug(article) === 'index';
}

export function articleUrl(article: Article): string {
  const section = article.data.section;
  return isSectionIndex(article) ? `/${section}/` : `/${section}/${articleSlug(article)}/`;
}

/**
 * Published articles, sorted by section order, then `order`, then title.
 * Throws on duplicate URLs and on published articles linking to drafts.
 */
export const getArticles = buildCached(loadArticles);

async function loadArticles(): Promise<Article[]> {
  const all = await getCollection('articles');
  const published = all.filter(isPublished);
  const ids = new Set(published.map((a) => a.id));

  const seen = new Map<string, string>();
  for (const article of published) {
    const url = articleUrl(article);
    const other = seen.get(url);
    if (other) throw new Error(`Articles "${other}" and "${article.id}" both resolve to ${url}`);
    seen.set(url, article.id);

    const refs = [
      ...article.data.prerequisites,
      ...article.data.related,
      ...(article.data.next ? [article.data.next] : []),
    ];
    for (const ref of refs) {
      if (!ids.has(ref.id)) {
        throw new Error(`Article "${article.id}" links to "${ref.id}", which is a draft or missing.`);
      }
    }
  }

  return published.sort(
    (a, b) =>
      SECTIONS.indexOf(a.data.section) - SECTIONS.indexOf(b.data.section) ||
      Number(isSectionIndex(b)) - Number(isSectionIndex(a)) ||
      byOrderThenTitle(a, b),
  );
}

export async function getSectionArticles(section: SectionId): Promise<Article[]> {
  return (await getArticles()).filter((a) => a.data.section === section);
}

/** Resolves article references to published articles, keeping their order. */
export async function resolveArticles(refs: Ref<'articles'>[]): Promise<Article[]> {
  const byId = new Map((await getArticles()).map((a) => [a.id, a]));
  return refs.map((ref) => byId.get(ref.id)).filter((a): a is Article => Boolean(a));
}

/**
 * Previous and next pages within the article's section, by `order`.
 * An explicit `next` in frontmatter overrides the computed next page.
 */
export async function getPrevNext(article: Article): Promise<{ prev?: Article; next?: Article }> {
  const list = await getSectionArticles(article.data.section);
  const index = list.findIndex((a) => a.id === article.id);
  const prev = index > 0 ? list[index - 1] : undefined;
  let next = index >= 0 && index < list.length - 1 ? list[index + 1] : undefined;
  if (article.data.next) {
    [next] = await resolveArticles([article.data.next]);
  }
  return { prev, next };
}

/** Memoizes a loader for the production build; always fresh in dev. */
function buildCached<T>(load: () => Promise<T>): () => Promise<T> {
  let cache: Promise<T> | undefined;
  return () => (import.meta.env.DEV ? load() : (cache ??= load()));
}

export const getVocabularyThemes = buildCached(async (): Promise<VocabularyTheme[]> =>
  (await getCollection('vocabulary')).filter(isPublished).sort(byOrderThenTitle),
);

export const vocabularyUrl = (theme: VocabularyTheme) => `/vocabulary/${theme.id}/`;

export const getGlossaryTerms = buildCached(async (): Promise<GlossaryTerm[]> =>
  (await getCollection('glossary')).filter(isPublished).sort((a, b) => a.data.term.localeCompare(b.data.term, 'en')),
);

export const glossaryUrl = (term: Pick<GlossaryTerm, 'id'> | string) =>
  `/glossary/#${typeof term === 'string' ? term : term.id}`;

export const getSources = buildCached(async (): Promise<Source[]> =>
  (await getCollection('sources')).sort((a, b) => a.data.title.localeCompare(b.data.title, 'en')),
);

export async function resolveSources(refs: Ref<'sources'>[]): Promise<Source[]> {
  const byId = new Map((await getSources()).map((s) => [s.id, s]));
  return refs.map((ref) => byId.get(ref.id)).filter((s): s is Source => Boolean(s));
}

export type ExerciseSetEntry = CollectionEntry<'exercises'>;

/**
 * Practice sets with public pages: `status: verified` only (plan.md E1).
 * Drafts are shown in `astro dev` (marked as drafts, noindex) so editors can
 * try them; production builds never include them.
 */
export const getExerciseSets = buildCached(async (): Promise<ExerciseSetEntry[]> =>
  (await getCollection('exercises'))
    .filter((s) => import.meta.env.DEV || s.data.status === 'verified')
    .sort(byOrderThenTitle),
);

export const exerciseUrl = (set: Pick<ExerciseSetEntry, 'id'>) => `/exercises/${set.id}/`;

/** Sections that will have an index page in this build. */
export async function getAvailableSections(): Promise<SectionId[]> {
  const articles = await getArticles();
  const themes = await getVocabularyThemes();
  return SECTIONS.filter(
    (id) => articles.some((a) => a.data.section === id) || (id === 'vocabulary' && themes.length > 0),
  );
}

export interface NavItem {
  label: string;
  href: string;
  /** Section id or 'glossary'; used to mark the current section. */
  key: string;
}

/**
 * Header navigation. Only routes that exist in this build are returned, so the
 * header never links to a missing page (brief: "Every visible navigation link
 * must lead to a complete page").
 */
export async function getNavigation(): Promise<{ primary: NavItem[]; secondary: NavItem[] }> {
  const available = new Set<string>(await getAvailableSections());
  if ((await getGlossaryTerms()).length > 0) available.add('glossary');
  if ((await getExerciseSets()).length > 0) available.add('exercises');
  const item = (key: string, label: string): NavItem => ({ key, label, href: `/${key}/` });
  const primary = [
    item('start-here', SECTION_INFO['start-here'].label),
    item('grammar', SECTION_INFO.grammar.label),
    item('sentences', SECTION_INFO.sentences.label),
    item('vocabulary', SECTION_INFO.vocabulary.label),
    item('exercises', 'Practice'),
  ];
  const secondary = [item('alphabet', SECTION_INFO.alphabet.label), item('glossary', 'Glossary'), item('search', 'Search')];
  available.add('search'); // /search/ always exists
  const keep = (i: NavItem) => available.has(i.key);
  return { primary: primary.filter(keep), secondary: secondary.filter(keep) };
}

export interface SectionNavData {
  heading: string;
  headingHref: string;
  links: { label: string; href: string }[];
}

/**
 * Left topic navigation for a section: its articles (except the index) and,
 * for Vocabulary, its themes. Undefined when there is nothing to list.
 */
export async function getSectionNav(section: SectionId): Promise<SectionNavData | undefined> {
  const links = (await getSectionArticles(section))
    .filter((a) => !isSectionIndex(a))
    .map((a) => ({ label: a.data.title, href: articleUrl(a) }));
  if (section === 'vocabulary') {
    for (const theme of await getVocabularyThemes()) {
      links.push({ label: theme.data.title, href: vocabularyUrl(theme) });
    }
  }
  if (links.length === 0) return undefined;
  return { heading: SECTION_INFO[section].label, headingHref: `/${section}/`, links };
}
