/**
 * Where a keyword may link inside code.
 *
 * The keywords plugin splits code into words and looks each one up. A word that happens to be a
 * keyword is not always a reference to it: an object key (`group: 'Colors'`), a property after a
 * dot, a string, an HTML attribute value or a file name in inline code (`vite.config.mjs`) only
 * share its name. Highlighted code carries no token scopes (Shiki emits colours only, and adjacent
 * tokens of one colour are merged), so this module reads the position of a word from the code text
 * itself with a small lexer: strings and comments, the characters around the word, and the names
 * the code declares. The result only depends on the code, never on the keyword set, so the words a
 * page records as used keywords are exactly the ones that may link.
 */

/** How the code around a word is read. */
export type CodeMode = 'typescript' | 'html';

/** What the plugin does with one word. */
export type WordPosition =
  /** Not a reference: the word stays plain text and is not recorded as used. */
  | { readonly link: false }
  /**
   * A reference. `keyword`, when present, is the key to look up instead of the word's own key: a
   * member after a dot is looked up as `Owner.member`.
   */
  | { readonly link: true; readonly keyword?: string };

/** The positions of the words of one code element. */
export interface CodeScan {
  /** Whether the whole element is a single keyword reference (inline code only). */
  readonly whole: boolean;
  /**
   * The position of the word at `[start, end)` of the element's text.
   * @param start - The offset of the word's first character.
   * @param end - The offset after the word's last character.
   * @param key - The word's key: the word without its `.member`/`#anchor` and query.
   */
  position(start: number, end: number, key: string): WordPosition;
}

const WORD_CHARACTER: RegExp = /[*\p{L}\w$@-]/u;
const IDENTIFIER_BEFORE: RegExp = /[\p{L}\w$@-]+$/u;
const WHOLE_KEYWORD: RegExp = /^\s*[*\p{L}\w$@-]+(?:[.#][\p{L}\w-]+)?(?:\?[\w=&]+)?\s*$/u;

/** Characters that make inline code read as TypeScript rather than as a name, path or prose. */
const CODE_PUNCTUATION: RegExp = /[(){}[\]<>|:=@]/;
/** Inline code that starts like a TypeScript declaration. */
const DECLARATION_START: RegExp =
  /^\s*(?:export|import|class|interface|type|const|let|var|function|enum|abstract|declare)\s/;
/** Inline code that starts with an HTML tag. */
const HTML_START: RegExp = /^\s*<\/?[A-Za-z]/;

/** Syntax words. They never link, even before `(` (`if (`, `function (`, `super(`). */
const SYNTAX_WORDS: ReadonlySet<string> = new Set([
  'await',
  'break',
  'case',
  'catch',
  'continue',
  'debugger',
  'delete',
  'do',
  'else',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'void',
  'while',
  'with',
  'yield',
]);

/**
 * TypeScript keywords and modifiers that are also valid names. They link only when called, so that
 * RxJS `of(…)` and `from(…)` still link while `readonly` in `readonly size = input()` or `from`
 * in an import does not.
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'abstract',
  'accessor',
  'any',
  'as',
  'asserts',
  'async',
  'bigint',
  'boolean',
  'class',
  'const',
  'constructor',
  'declare',
  'default',
  'enum',
  'export',
  'extends',
  'from',
  'get',
  'implements',
  'import',
  'in',
  'infer',
  'interface',
  'is',
  'keyof',
  'let',
  'module',
  'namespace',
  'never',
  'number',
  'object',
  'of',
  'out',
  'override',
  'package',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'satisfies',
  'set',
  'static',
  'string',
  'symbol',
  'type',
  'undefined',
  'unique',
  'unknown',
  'var',
]);

/** The characters before a name in a type position: `: Type`, `A | B`, `A & B`, `Generic<Type`. */
const TYPE_CONTEXT: readonly string[] = [':', '|', '&', '<'];
/** The words before a name in a type position, or before a type alias's name. */
const TYPE_WORDS: readonly string[] = ['type', 'extends', 'keyof', 'typeof'];

/** What a character of code is, in a scan's marks. */
const CODE = 0;
const STRING = 1;
const COMMENT = 2;
/** The text of a TypeScript template literal, outside its `${…}` expressions. */
const TEMPLATE = 3;

/** An Angular control flow block in an inline template (`@if`, `@for`, `@defer`). */
const CONTROL_FLOW: RegExp = /^@[a-z]+$/;

const NOT_A_REFERENCE: WordPosition = Object.freeze({ link: false });
const REFERENCE: WordPosition = Object.freeze({ link: true });

/**
 * The positions of the words of inline code, or `undefined` when no word of it may link.
 *
 * Inline code links when it is one keyword reference as a whole (`NgDocPage`, `*GuidePage#anchor`,
 * `NgDocPage.title`, with an optional `?query`), or when it reads as TypeScript: it contains code
 * punctuation (a call, generics, a union, an array type, a decorator, a type annotation) or starts
 * with a declaration. Then its words link where they would in a TypeScript code block. Anything
 * else (a file name like `vite.ng-doc.config.mjs`, a path, a command, prose, an HTML tag) stays
 * plain text.
 * @param text - The text of the inline code element.
 */
export function scanInlineCode(text: string): CodeScan | undefined {
  if (WHOLE_KEYWORD.test(text)) {
    return { whole: true, position: () => REFERENCE };
  }

  if (HTML_START.test(text) || !(CODE_PUNCTUATION.test(text) || DECLARATION_START.test(text))) {
    return undefined;
  }

  const scan = scanTypeScript(text);

  // A message or a sentence with some punctuation (`Refusing to overwrite unowned output`) is not
  // code: TypeScript never has three plain names in a row.
  return isProse(text, scan.masked) ? undefined : scan;
}

/**
 * The positions of the words of a code block.
 * @param text - The text of the block's `code` element.
 * @param mode - How the block's language is read.
 */
export function scanCodeBlock(text: string, mode: CodeMode): CodeScan {
  return mode === 'html' ? scanHtml(text) : scanTypeScript(text);
}

interface TypeScriptScan extends CodeScan {
  readonly masked: Uint8Array;
}

/**
 * TypeScript: a word links unless it is inside a string or a comment (in a template literal, only
 * Angular control flow blocks and the names of custom elements link), a syntax word, a reserved
 * word that is not called, a property after a dot (it then links only as a whole `Owner.member`
 * keyword), a declared name (an object key, a property, a parameter or a variable before `:`,
 * `?:`, `!:` or `=`), or a name the code binds itself (`const`/`let`/`var`, or an import from a
 * relative module).
 * @param text - The code.
 */
function scanTypeScript(text: string): TypeScriptScan {
  const masked = maskTypeScript(text);
  const locals = localBindings(text, masked);

  return {
    whole: false,
    masked,
    position(start: number, end: number, key: string): WordPosition {
      if (masked[start] === TEMPLATE) {
        // A template literal is usually an inline Angular template: its control flow blocks and
        // the names of custom elements (`<ng-content>`, `</ng-container>`; a standard element
        // such as `<input>` has no dash) refer to Angular and components, while its attributes
        // and text are the template's own.
        const before = text[start - 1] ?? '';
        const element =
          key.includes('-') && (before === '<' || (before === '/' && text[start - 2] === '<'));
        const controlFlow = CONTROL_FLOW.test(key) && !WORD_CHARACTER.test(before);

        return element || controlFlow ? REFERENCE : NOT_A_REFERENCE;
      }

      if (masked[start] !== CODE) {
        return NOT_A_REFERENCE;
      }

      const previous = previousSignificant(text, start, masked);
      const next = nextSignificant(text, end, masked);
      const nextCharacter = text[next] ?? '';

      if (SYNTAX_WORDS.has(key) || (RESERVED_WORDS.has(key) && nextCharacter !== '(')) {
        return NOT_A_REFERENCE;
      }

      if (text[previous] === '.' && text[previous - 1] !== '.') {
        // `owner.member` and `owner?.member`
        const ownerEnd = text[previous - 1] === '?' ? previous - 1 : previous;
        const owner = text.slice(0, ownerEnd).match(IDENTIFIER_BEFORE)?.[0];
        const word = text.slice(start, end);

        return owner && !/[.#]/.test(word)
          ? { link: true, keyword: `${owner}.${key.toLowerCase()}` }
          : NOT_A_REFERENCE;
      }

      if (isDeclaredName(text, masked, previous, next)) {
        return NOT_A_REFERENCE;
      }

      return locals.has(key) ? NOT_A_REFERENCE : REFERENCE;
    },
  };
}

/**
 * Whether the word between `previous` and `next` is a name being declared rather than used.
 * @param text - The code.
 * @param masked - The marks of its strings and comments.
 * @param previous - The index of the significant character before the word, or -1.
 * @param next - The index of the significant character after the word.
 */
function isDeclaredName(text: string, masked: Uint8Array, previous: number, next: number): boolean {
  const after = text[next];
  const afterNext = text[nextSignificant(text, next + 1, masked)];

  if (after === ':' && text[next + 1] !== ':') {
    // `cond ? Value : other` and `case Value:` use the name.
    const ternary = text[previous] === '?' && text[previous + 1] !== '.';

    return !ternary && previousWord(text, previous) !== 'case';
  }

  if ((after === '?' || after === '!') && afterNext === ':') {
    return true;
  }

  if (after === '?' && (afterNext === ')' || afterNext === ',')) {
    return true;
  }

  if (after === '=' && text[next + 1] !== '=' && text[next + 1] !== '>') {
    // A type before `=` (`size: NgDocSize = …`, `<T extends Base = Base>`) is used, and
    // `type Name = …` declares a type alias, which is linked like a class.
    return (
      !TYPE_CONTEXT.includes(text[previous] ?? '') &&
      !TYPE_WORDS.includes(previousWord(text, previous))
    );
  }

  return false;
}

/**
 * HTML: a word links unless it is inside a comment or an attribute value. Which keywords may link
 * in HTML at all (the selectors of components and directives) is decided by their languages.
 * @param text - The code.
 */
function scanHtml(text: string): CodeScan {
  const masked = maskHtml(text);

  return {
    whole: false,
    position: (start: number) => (masked[start] === CODE ? REFERENCE : NOT_A_REFERENCE),
  };
}

/**
 * Marks the characters of TypeScript strings and comments. The `${…}` expressions of template
 * literals stay code. Regular expression literals are not recognised.
 * @param text - The code.
 */
function maskTypeScript(text: string): Uint8Array {
  const masked = new Uint8Array(text.length);
  // The brace depth of every open `${` of a template literal, innermost last.
  const templates: number[] = [];
  let depth = 0;
  let index = 0;

  const string = (quote: string): void => {
    const start = index++;
    while (index < text.length && text[index] !== quote && text[index] !== '\n') {
      index += text[index] === '\\' ? 2 : 1;
    }
    masked.fill(STRING, start, Math.min(++index, text.length));
  };
  const template = (): void => {
    const start = index++;
    while (index < text.length && text[index] !== '`') {
      if (text[index] === '\\') {
        index += 2;
      } else if (text[index] === '$' && text[index + 1] === '{') {
        masked.fill(TEMPLATE, start, index);
        templates.push(depth);
        index += 2;
        return;
      } else {
        index++;
      }
    }
    masked.fill(TEMPLATE, start, Math.min(++index, text.length));
  };

  while (index < text.length) {
    const character = text[index];

    if (character === '/' && text[index + 1] === '/') {
      const end = text.indexOf('\n', index);
      const stop = end < 0 ? text.length : end;
      masked.fill(COMMENT, index, stop);
      index = stop;
    } else if (character === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      const stop = end < 0 ? text.length : end + 2;
      masked.fill(COMMENT, index, stop);
      index = stop;
    } else if (character === "'" || character === '"') {
      string(character);
    } else if (character === '`') {
      template();
    } else if (character === '{') {
      depth++;
      index++;
    } else if (character === '}') {
      if (templates.length && templates[templates.length - 1] === depth) {
        // The end of a `${…}` expression: the template literal goes on.
        templates.pop();
        template();
      } else {
        depth--;
        index++;
      }
    } else {
      index++;
    }
  }

  return masked;
}

/**
 * Marks the characters of HTML comments and attribute values.
 * @param text - The code.
 */
function maskHtml(text: string): Uint8Array {
  const masked = new Uint8Array(text.length);
  let index = 0;

  while (index < text.length) {
    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index + 4);
      const stop = end < 0 ? text.length : end + 3;
      masked.fill(COMMENT, index, stop);
      index = stop;
    } else if (text[index] === '<' && /[A-Za-z/]/.test(text[index + 1] ?? '')) {
      index = maskTag(text, index + 1, masked);
    } else {
      index++;
    }
  }

  return masked;
}

/**
 * Marks the attribute values of the tag that starts at `index` and returns the index after it.
 * @param text - The code.
 * @param index - The index after the tag's `<`.
 * @param masked - The marks.
 */
function maskTag(text: string, index: number, masked: Uint8Array): number {
  while (index < text.length && text[index] !== '>') {
    if (text[index] !== '=') {
      index++;
      continue;
    }

    index++;
    while (text[index] === ' ' || text[index] === '\t' || text[index] === '\n') index++;

    const quote = text[index];
    const start = index;

    if (quote === '"' || quote === "'") {
      const end = text.indexOf(quote, index + 1);
      index = end < 0 ? text.length : end + 1;
    } else {
      while (index < text.length && !/[\s>]/.test(text[index] ?? '')) index++;
    }

    masked.fill(STRING, start, index);
  }

  return index + 1;
}

/**
 * The names the code binds itself: `const`, `let` and `var` declarations and the names imported
 * from relative modules. A use of such a name refers to the code's own binding, not to a keyword
 * of the same name (`const config = …; export default config;`).
 * @param text - The code.
 * @param masked - The marks of its strings and comments.
 */
function localBindings(text: string, masked: Uint8Array): Set<string> {
  const names = new Set<string>();

  for (const match of text.matchAll(/\b(?:const|let|var)\s+([\p{L}_$][\p{L}\w$]*)/gu)) {
    if (!masked[match.index]) names.add(match[1] ?? '');
  }

  for (const match of text.matchAll(
    /\bimport\s+(?:type\s+)?([^;]*?)\s+from\s+(['"])\.{1,2}\/[^'"]*\2/gu,
  )) {
    if (masked[match.index]) continue;

    for (const name of (match[1] ?? '').matchAll(
      /([\p{L}_$][\p{L}\w$]*)(?:\s+as\s+([\p{L}_$][\p{L}\w$]*))?/gu,
    )) {
      const local = name[2] ?? name[1] ?? '';
      if (local !== 'type' && local !== 'as') names.add(local);
    }
  }

  return names;
}

/**
 * Whether inline code reads as a sentence: three plain names in a row, separated by spaces only,
 * outside strings and comments.
 * @param text - The inline code.
 * @param masked - The marks of its strings and comments.
 */
function isProse(text: string, masked: Uint8Array): boolean {
  for (const match of text.matchAll(/[\p{L}_$][\p{L}\w$]*(?: [\p{L}_$][\p{L}\w$]*){2,}/gu)) {
    const words = match[0].split(' ');
    const plain = words.filter((word) => !SYNTAX_WORDS.has(word) && !RESERVED_WORDS.has(word));

    if (!masked[match.index] && plain.length >= 3) {
      return true;
    }
  }

  return false;
}

/**
 * The index of the last character before `index` that is neither whitespace nor in a comment, or
 * -1.
 * @param text - The code.
 * @param index - The index to look back from.
 * @param masked - The marks of its strings and comments.
 */
function previousSignificant(text: string, index: number, masked: Uint8Array): number {
  let position = index - 1;
  while (position >= 0 && insignificant(text, position, masked)) position--;
  return position;
}

/**
 * The index of the first character at or after `index` that is neither whitespace nor in a
 * comment.
 * @param text - The code.
 * @param index - The index to look from.
 * @param masked - The marks of its strings and comments.
 */
function nextSignificant(text: string, index: number, masked: Uint8Array): number {
  let position = index;
  while (position < text.length && insignificant(text, position, masked)) position++;
  return position;
}

/**
 * Whether the character at `index` is whitespace or part of a comment.
 * @param text - The code.
 * @param index - The index of the character.
 * @param masked - The marks of its strings and comments.
 */
function insignificant(text: string, index: number, masked: Uint8Array): boolean {
  return masked[index] === COMMENT || /\s/.test(text[index] ?? '');
}

/**
 * The word that ends at `index` (inclusive), or an empty string.
 * @param text - The code.
 * @param index - The index of the word's last character.
 */
function previousWord(text: string, index: number): string {
  let start = index;
  while (start >= 0 && WORD_CHARACTER.test(text[start] ?? '')) start--;
  return text.slice(start + 1, index + 1);
}
