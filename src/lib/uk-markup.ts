/**
 * Splits a string into Ukrainian (Cyrillic) and other runs so components can
 * render the Cyrillic parts with lang="uk".
 */
const RUN = /[\p{Script=Cyrillic}́]+(?:[’'-][\p{Script=Cyrillic}́]+)*/gu;

export interface TextRun {
  text: string;
  uk: boolean;
}

export function splitUk(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;
  for (const m of text.matchAll(RUN)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), uk: false });
    runs.push({ text: m[0], uk: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), uk: false });
  return runs;
}

/**
 * Wraps Cyrillic runs in the text of an HTML fragment (outside tags) in
 * <span lang="uk">. Text already inside an element with lang="uk" is kept as is.
 */
export function markUkHtml(html: string): string {
  let depth = 0; // open lang="uk" elements around the current position
  const stack: boolean[] = []; // per open element: did it carry lang="uk"?
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        const m = /^<(\/?)([a-zA-Z][\w-]*)/.exec(part);
        if (!m) return part;
        if (m[1]) {
          if (stack.pop()) depth--;
        } else if (!part.endsWith('/>') && !/^(br|img|wbr|hr)$/i.test(m[2] ?? '')) {
          const uk = /\blang=["']?uk/.test(part);
          stack.push(uk);
          if (uk) depth++;
        }
        return part;
      }
      return depth > 0
        ? part
        : splitUk(part)
            .map((r) => (r.uk ? `<span lang="uk">${r.text}</span>` : r.text))
            .join('');
    })
    .join('');
}
