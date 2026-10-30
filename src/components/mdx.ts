/**
 * Components available in every MDX article without an import. Pass to
 * <Content components={mdxComponents} />. H2-H4 replace the plain headings so
 * Cyrillic in headings gets lang="uk" (see Heading.astro).
 */
import Example from './Example.astro';
import ExampleList from './ExampleList.astro';
import GrammarTable from './GrammarTable.astro';
import H2 from './H2.astro';
import H3 from './H3.astro';
import H4 from './H4.astro';
import Note from './Note.astro';
import SourceList from './SourceList.astro';
import Uk from './Uk.astro';

export const mdxComponents = { Example, ExampleList, GrammarTable, Note, SourceList, Uk, h2: H2, h3: H3, h4: H4 };
