// Builds the Pagefind search index for dist/ (plan B18). Run after `astro build`.
//
// Ukrainian examples carry stress marks (U+0301). Pagefind would index
// "мо́ва" as a different word from "мова", and nobody types the marks, so
// each page is indexed from a copy of its HTML with U+0301 removed. The
// pages themselves are not changed.
//
// Only content inside [data-pagefind-body] is indexed (article and reference
// pages); navigation inside it is marked data-pagefind-ignore in the layouts.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import * as pagefind from 'pagefind';

const DIST = 'dist';
const ACUTE = /́/g;

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'pagefind') yield* htmlFiles(path);
    } else if (entry.name.endsWith('.html')) {
      yield path;
    }
  }
}

const { index, errors } = await pagefind.createIndex({ forceLanguage: 'en' });
if (!index) throw new Error(`Pagefind: ${errors.join('; ')}`);

let pages = 0;
for await (const file of htmlFiles(DIST)) {
  const html = await readFile(file, 'utf8');
  if (!html.includes('data-pagefind-body')) continue;
  const url = '/' + relative(DIST, file).split(sep).join('/').replace(/index\.html$/, '');
  const { errors: addErrors } = await index.addHTMLFile({ url, content: html.replace(ACUTE, '') });
  if (addErrors.length) throw new Error(`Pagefind ${url}: ${addErrors.join('; ')}`);
  pages++;
}

const { errors: writeErrors } = await index.writeFiles({ outputPath: join(DIST, 'pagefind') });
if (writeErrors.length) throw new Error(`Pagefind: ${writeErrors.join('; ')}`);
await pagefind.close();
console.log(`Search index: ${pages} pages written to ${DIST}/pagefind/`);
