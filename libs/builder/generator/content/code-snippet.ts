import { removeLinesFromCode } from '../../helpers/remove-lines-from-code';
import { parseSnippet } from '../../parsers/parse-snippet';

/**
 * A snippet marker line, exactly as demos find them (`helpers/process-snippets.ts`): a line with a
 * `//`, `<!--` or `/*` comment whose text starts with `snippet`. The whole line is the marker.
 */
const MARKER = /^.*((\/\/|<!--|\/\*)\s*)(snippet.*?(?=(-->|\*\/)?))\s*(-->|\*\/)?$/;

/** The code of a named snippet, or why a file has none. */
export type SnippetRegion =
  | { status: 'found'; code: string }
  | { status: 'unknown' }
  | { status: 'unclosed' };

/**
 * The region of `text` between the first `snippet#<id>` marker and the next marker with the same
 * id, as a code block's `file="./x.ts"#<id>` shows it: every marker line inside it is removed
 * (nested snippets included, as in demos) and so are `ng-doc-ignore-line` lines, blank lines
 * around it are dropped, and the common indentation is taken off, so a region inside a class
 * reads like top-level code. Lines end with LF whatever the file uses, so the output never
 * depends on the platform that saved the file.
 * @param text - The whole file.
 * @param id - The snippet id.
 */
export function snippetRegion(text: string, id: string): SnippetRegion {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const markers = lines.map((line) => {
    const match = MARKER.exec(line);
    return match ? parseSnippet(match[3].trim())?.id ?? null : undefined;
  });
  const start = markers.indexOf(id);
  if (start < 0) return { status: 'unknown' };
  const end = markers.indexOf(id, start + 1);
  if (end < 0) return { status: 'unclosed' };
  // Ignored lines go first, so the blank lines they leave at an end are dropped too.
  const region = removeLinesFromCode(
    lines
      .slice(start + 1, end)
      .filter((_, index) => markers[start + 1 + index] === undefined)
      .join('\n'),
  ).split('\n');
  while (region.length && !region[0].trim()) region.shift();
  while (region.length && !region[region.length - 1].trim()) region.pop();
  const indent = Math.min(
    ...region.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length),
  );
  return { status: 'found', code: region.map((line) => line.slice(indent)).join('\n') };
}
