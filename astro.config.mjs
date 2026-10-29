// @ts-check
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import svelte from '@astrojs/svelte';

const require = createRequire(import.meta.url);

// Subsets needed for Ukrainian text. `cyrillic` holds А–я, Ґґ Єє Іі Її and the
// combining acute (U+0301); `latin` holds the U+2019 apostrophe and dashes.
// Keep in sync with SUBSETS in scripts/check-font-glyphs.mjs.
const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'];

/**
 * Builds local-provider variants from a Fontsource CSS file, keeping its exact
 * per-subset unicode-range values. Files are self-hosted from node_modules
 * (packages pinned by package-lock.json; fonts are SIL OFL 1.1).
 *
 * Why not `fontProviders.npm()`: in Astro 7.4.4 it resolves local packages to
 * file:// URLs that the font fetcher then passes to fetch(), which fails
 * (CannotFetchFontFile). The local provider reads files from disk instead.
 *
 * @param {string} cssEntry  e.g. '@fontsource-variable/noto-sans/wght.css'
 * @param {'normal' | 'italic'} style
 */
function fontsourceVariants(cssEntry, style) {
  const cssPath = require.resolve(cssEntry);
  const css = readFileSync(cssPath, 'utf8');
  const variants = [];
  for (const [, body] of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const url = body.match(/url\(([^)]+)\)/)?.[1];
    const range = body.match(/unicode-range:\s*([^;]+);/)?.[1];
    const weight = body.match(/font-weight:\s*([^;]+);/)?.[1];
    if (!url || !range || !weight) continue;
    if (!SUBSETS.some((s) => url.includes(`-${s}-wght-`))) continue;
    const file = relative(process.cwd(), join(dirname(cssPath), url)).replaceAll('\\', '/');
    variants.push({
      src: /** @type {[string]} */ ([`./${file}`]),
      weight: weight.trim(),
      style,
      display: /** @type {const} */ ('swap'),
      unicodeRange: nonEmpty(
        range.split(',').map((r) => r.trim()),
        `${cssEntry} unicode-range`,
      ),
    });
  }
  return nonEmpty(variants, cssEntry);
}

/**
 * The local provider's `variants` option is typed as a non-empty tuple.
 * @template T
 * @param {T[]} list
 * @param {string} what
 * @returns {[T, ...T[]]}
 */
function nonEmpty(list, what) {
  const [first, ...rest] = list;
  if (first === undefined) throw new Error(`Nothing found for ${what}`);
  return [first, ...rest];
}

const systemSans = ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'];

// No `site` yet: there is no real domain (plan.md A14). Do not add one, and do
// not add canonical URLs or a sitemap, until a real origin exists.
// https://astro.build/config
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  integrations: [mdx(), svelte()],
  fonts: [
    {
      provider: fontProviders.local(),
      // Body and Ukrainian examples. Noto Sans, not Inter: Inter (both the
      // Fontsource subset and the full rsms release) positions the combining
      // acute U+0301 after Cyrillic vowels instead of over them (HarfBuzz and
      // Chromium both confirm), which breaks stress marks. `npm run check:fonts`
      // tests mark placement.
      name: 'Noto Sans',
      cssVariable: '--font-noto-sans',
      fallbacks: systemSans,
      options: {
        variants: nonEmpty(
          [
            ...fontsourceVariants('@fontsource-variable/noto-sans/wght.css', 'normal'),
            ...fontsourceVariants('@fontsource-variable/noto-sans/wght-italic.css', 'italic'),
          ],
          'Noto Sans',
        ),
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Manrope',
      cssVariable: '--font-manrope',
      // No fallbacks here on purpose: --font-heading in src/styles/tokens.css
      // is "var(--font-manrope), var(--font-body)", so anything Manrope lacks
      // (notably the combining acute U+0301 used for stress marks) falls back
      // to Noto Sans and then the system stack. Keep stress marks out of headings.
      fallbacks: [],
      options: {
        variants: fontsourceVariants('@fontsource-variable/manrope/wght.css', 'normal'),
      },
    },
  ],
});
