import P from 'parsimmon';

import type { NgDocCodeBlockParams } from '../interfaces/code-block-options';
import { number, param } from './helpers';

/**
 * A code block language: a Shiki language id or alias. Besides letters and dashes, they use digits
 * (`f90`, `1c`), `+` and `#` (`c++`, `c#`, `f#`) and other scripts (`文言`). Quotes, `=`, braces and
 * whitespace end it, so the parameters that follow are parsed as before.
 */
const CODE_BLOCK_LANGUAGE: RegExp = /[\p{L}\p{N}+#-]+/u;

/** The characters of a snippet id, as `// snippet#<id>` markers spell it (`parseSnippet`). */
const SNIPPET_ID: RegExp = /[a-zA-Z0-9-]+/;

/** A fragment that is a line range: `L<n>`, `L<n>-` or `L<n>-L<m>`. */
const LINE_RANGE: RegExp = /^L(\d+)(?:(-)(?:L(\d+))?)?$/;

/** Options of {@link parseCodeBlockParams}. */
export interface NgDocCodeBlockParserOptions {
  /**
   * Whether a fragment after the `file` parameter may name a snippet: `file="./x.ts"#greeting`.
   * Without it, only line ranges are accepted, and any other fragment fails to parse.
   */
  snippets?: boolean;
}

/**
 * The fragment after a `file` parameter when snippets are on: `#L<n>`, `#L<n>-` and
 * `#L<n>-L<m>` are line ranges (the same ranges as without snippets), any other id names a
 * snippet.
 * @param fragment - The fragment without its `#`.
 */
function fileFragment(fragment: string): Partial<NgDocCodeBlockParams> {
  const range = LINE_RANGE.exec(fragment);
  if (!range) return { snippet: fragment };
  const fileLineStart = Number(range[1]) - 1;
  if (!range[2]) return { fileLineStart, fileLineEnd: fileLineStart + 1 };
  return { fileLineStart, fileLineEnd: range[3] === undefined ? undefined : Number(range[3]) };
}

/**
 * Code block options parser
 * @param options - Options string to parse
 * @param parserOptions - What the caller supports beyond the original syntax.
 */
export function parseCodeBlockParams(
  options: string,
  parserOptions: NgDocCodeBlockParserOptions = {},
): NgDocCodeBlockParams {
  const parser = P.createLanguage({
    language: () =>
      P.regexp(CODE_BLOCK_LANGUAGE)
        .skip(P.optWhitespace)
        .map((language) => ({ language })),
    // File Parsers
    fileLineNumber: () => P.string('L').then(P.digits).map(Number),
    fileLineRange: (p) =>
      P.seqMap(
        P.string('#')
          .then(p['fileLineNumber'])
          .map((num) => num - 1),
        P.string('-').then(p['fileLineNumber'].fallback(undefined)),
        (fileLineStart, fileLineEnd) => ({ fileLineStart, fileLineEnd }),
      ),
    fileLineStart: (p) =>
      P.string('#')
        .then(p['fileLineNumber'])
        .map((num) => num - 1)
        .map((fileLineStart) => ({ fileLineStart, fileLineEnd: fileLineStart + 1 })),
    lineParams: (p) =>
      (parserOptions.snippets
        ? P.string('#').then(P.regexp(SNIPPET_ID)).map(fileFragment)
        : p['fileLineRange'].or(p['fileLineStart'])
      ).fallback({}),
    highlightedLinesRange: () =>
      P.seqMap(number.skip(P.string('-')), number, (start, end) =>
        [...Array(end + 1).keys()].slice(start - end - 1),
      ),

    // Main Parsers
    lineNumbers: () => P.string('lineNumbers').map(() => ({ lineNumbers: true })),
    filePath: () => param('file'),
    name: () => param('name'),
    group: () => param('group'),
    fileName: () => param('fileName', 'name'),
    icon: () => param('icon'),
    active: () => P.string('active').map(() => ({ active: true })),
    file: (p) =>
      P.seq(
        p['filePath'],
        p['lineParams'].map(({ fileLineStart, fileLineEnd, snippet }) => ({
          fileLineStart,
          fileLineEnd,
          ...(snippet === undefined ? {} : { snippet }),
        })),
      ).map(([file, lineParams]) => ({ ...file, ...lineParams })),

    highlightedLines: (p) =>
      p['highlightedLinesRange']
        .or(number)
        .sepBy(P.string(',').then(P.optWhitespace))
        .wrap(P.string('{'), P.string('}'))
        .map((a) => Array.from(new Set(a.flat())))
        .map((highlightedLines) => ({ highlightedLines })),

    // Combined Parsers
    paramsParser: (p: P.Language) =>
      p['lineNumbers']
        .or(p['fileName'])
        .or(p['file'])
        .or(p['name'])
        .or(p['group'])
        .or(p['active'])
        .or(p['icon'])
        .or(p['highlightedLines'])
        .sepBy(P.whitespace),
    languageWithParamsParser: (p) => P.seq(p['language'], p['paramsParser']).map((v) => v.flat()),
  });

  let result = parser['paramsParser'].parse(options);

  if (result.status) {
    return result.value.reduce(
      (acc: NgDocCodeBlockParams, cur: Partial<NgDocCodeBlockParams>) => ({ ...acc, ...cur }),
      {},
    );
  }

  result = parser['languageWithParamsParser'].parse(options);

  if (result.status) {
    return result.value.reduce(
      (acc: NgDocCodeBlockParams, cur: Partial<NgDocCodeBlockParams>) => ({ ...acc, ...cur }),
      {},
    );
  }

  throw new Error(`Unable to parse code block options: "${options}"`);
}
