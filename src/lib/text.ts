/** Combining acute accent (U+0301), used to mark stress (plan.md A9). */
const STRESS_MARK = /́/g;

/**
 * Removes stress marks only. Deliberately not a full NFD diacritic strip:
 * that would also break й (и + U+0306) and ї (і + U+0308).
 */
export function stripStress(text: string): string {
  return text.replace(STRESS_MARK, '');
}

/** Normalizes apostrophe variants (', ʼ, ’) to U+2019 for matching (plan.md A10). */
export function normalizeApostrophes(text: string): string {
  return text.replace(/['ʼ’]/g, '’');
}

/** A URL-safe id for headings and anchors (ASCII and Cyrillic letters kept). */
export function slugify(text: string): string {
  return stripStress(text)
    .toLowerCase()
    .normalize('NFC')
    .replace(/['ʼ’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
