/**
 * Components available in every MDX article without an import. Pass to
 * <Content components={mdxComponents} />.
 */
import Example from './Example.astro';
import ExampleList from './ExampleList.astro';
import GrammarTable from './GrammarTable.astro';
import Note from './Note.astro';
import SourceList from './SourceList.astro';
import Uk from './Uk.astro';

export const mdxComponents = { Example, ExampleList, GrammarTable, Note, SourceList, Uk };
