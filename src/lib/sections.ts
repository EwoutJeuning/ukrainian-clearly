/**
 * Site sections. The order here is the order used in navigation and on the
 * home page. Labels follow the house style's navigation labels.
 */
export const SECTIONS = ['start-here', 'alphabet', 'grammar', 'sentences', 'vocabulary', 'about'] as const;

export type SectionId = (typeof SECTIONS)[number];

export interface SectionInfo {
  id: SectionId;
  /** Navigation label. */
  label: string;
  /** Page title for the section index. */
  title: string;
  /** One-sentence description used on index pages and previews. */
  description: string;
}

export const SECTION_INFO: Record<SectionId, SectionInfo> = {
  'start-here': {
    id: 'start-here',
    label: 'Start here',
    title: 'Start here',
    description: 'A suggested reading path for complete beginners.',
  },
  alphabet: {
    id: 'alphabet',
    label: 'Alphabet',
    title: 'Alphabet and pronunciation',
    description: 'The Ukrainian letters, how they sound, stress, and transliteration.',
  },
  grammar: {
    id: 'grammar',
    label: 'Grammar',
    title: 'Grammar',
    description: 'Grammar topics explained step by step, with examples.',
  },
  sentences: {
    id: 'sentences',
    label: 'Beginner sentences',
    title: 'Beginner sentences',
    description: 'Useful sentence patterns grouped by everyday situation.',
  },
  vocabulary: {
    id: 'vocabulary',
    label: 'Vocabulary',
    title: 'Vocabulary',
    description: 'Small thematic word lists with the grammar you need to use them.',
  },
  about: {
    id: 'about',
    label: 'About and sources',
    title: 'About and sources',
    description: 'How this site is written, its conventions, and the references used.',
  },
};

export const sectionPath = (id: SectionId) => `/${id}/`;
