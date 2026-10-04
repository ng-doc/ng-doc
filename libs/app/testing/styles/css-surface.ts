import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { AtRule, Rule } from 'postcss';
import * as sass from 'sass';

/**
 * Collects the `--ng-doc-*` custom-property surface of the runtime libraries.
 *
 * The public surface is what users can override from their own stylesheet, so it is measured the way
 * a browser sees it: SCSS is compiled first (names built by interpolation only exist after
 * compilation), and TypeScript/HTML sources are scanned as text for style bindings and inline styles.
 */

/** Prefix of every NgDoc custom property. */
export const NG_DOC_PREFIX = '--ng-doc-';

/** Where a custom property is declared in the compiled global stylesheet. */
export type ThemeContext = 'root' | 'dark' | 'auto' | 'local';

/** A `var(--*)` read. */
export interface VariableRead {
  name: string;
  hasFallback: boolean;
  file: string;
  /**
   * Where the read happens: `<file> :: <selector>` for a declaration in a stylesheet (with
   * ` :: <custom property>` when the read sits inside a custom property's value), or the file of a
   * TypeScript or HTML source.
   */
  reader: string;
  /** The custom property whose value holds the read; unset when a regular property reads it. */
  via?: string;
}

/** A custom-property declaration (or a TS/HTML binding that sets one). */
export interface VariableDeclaration {
  name: string;
  value: string;
  context: ThemeContext;
  file: string;
  /** The rule's selector, prefixed by its at-rules (`(binding)` for a TypeScript/HTML mention). */
  selector: string;
}

/** Everything the contract needs to know about one stylesheet or source file. */
export interface SurfaceScan {
  reads: VariableRead[];
  declarations: VariableDeclaration[];
  /** Every `--ng-doc-*` name mentioned in the scanned sources, in any position. */
  names: Set<string>;
  /** SCSS files that could not be compiled on their own and were scanned as text instead. */
  uncompiled: string[];
  /** For each compiled stylesheet, the workspace files it loads through `@import`/`@use`. */
  imports: Map<string, Set<string>>;
}

const NAME_PATTERN = /--ng-doc-[a-zA-Z0-9_-]*[a-zA-Z0-9]/g;

/**
 * Finds every `var(--*)` read in a CSS value or source text, including reads nested inside another
 * read's fallback.
 * @param text - CSS value or source text.
 * @param file - File the text comes from.
 * @param reader - Where the read happens (see {@link VariableRead.reader}).
 * @param via - The custom property whose value holds the text, if any.
 */
export function findReads(
  text: string,
  file: string,
  reader: string = file,
  via?: string,
): VariableRead[] {
  const reads: VariableRead[] = [];
  const pattern = /var\(\s*(--[a-zA-Z0-9_-]*[a-zA-Z0-9])\s*([,)])?/g;

  for (const match of text.matchAll(pattern)) {
    reads.push({ name: match[1], hasFallback: match[2] === ',', file, reader, via });
  }

  return reads;
}

/**
 * Compiles an SCSS file with the options the libraries are built with, silencing deprecation noise.
 * @param file - Absolute path of the SCSS entry.
 */
export function compileScss(file: string): string {
  return compileScssWithImports(file).css;
}

/**
 * Compiles an SCSS file and reports the workspace files it loaded, other than itself.
 * @param file - Absolute path of the SCSS entry.
 */
export function compileScssWithImports(file: string): { css: string; imports: Set<string> } {
  const root = workspaceRoot();
  const result = sass.compile(file, {
    style: 'expanded',
    logger: sass.Logger.silent,
    loadPaths: [join(root, 'node_modules')],
  });
  const imports = new Set(
    result.loadedUrls
      .filter((url) => url.protocol === 'file:')
      .map((url) => relative(root, fileURLToPath(url)).split(sep).join('/'))
      .filter(
        (path) => !path.startsWith('..') && path !== relative(root, file).split(sep).join('/'),
      ),
  );

  return { css: result.css, imports };
}

/**
 * Drops entries that a stylesheet only repeats because it imports another scanned stylesheet: an
 * entry of `global.scss` whose selector and property also come from `typography.scss`, which
 * `global.scss` imports, is reported once, for `typography.scss`.
 * @param entries - Entries as `<file> :: <rest>`.
 * @param imports - For each compiled stylesheet, the files it loads.
 */
export function withoutImportedDuplicates(
  entries: string[],
  imports: Map<string, Set<string>>,
): string[] {
  const split = entries.map((entry) => {
    const index = entry.indexOf(' :: ');

    return index < 0
      ? { entry, file: entry, rest: '' }
      : { entry, file: entry.slice(0, index), rest: entry.slice(index + 4) };
  });
  const filesByRest = new Map<string, Set<string>>();

  for (const { file, rest } of split) {
    filesByRest.set(rest, (filesByRest.get(rest) ?? new Set()).add(file));
  }

  return split
    .filter(({ file, rest }) => {
      const loaded = imports.get(file);

      return (
        !rest || !loaded || ![...(filesByRest.get(rest) ?? [])].some((other) => loaded.has(other))
      );
    })
    .map(({ entry }) => entry);
}

/**
 * Scans compiled CSS. Declarations are classified by the rule that holds them: exactly `:root`, the
 * dark theme (`:root[data-theme=dark]`), the auto theme inside `prefers-color-scheme: dark`, or any
 * other (component-local) selector.
 * @param css - Compiled CSS.
 * @param file - File the CSS was compiled from.
 */
export function scanCss(css: string, file: string): Omit<SurfaceScan, 'uncompiled' | 'imports'> {
  const reads: VariableRead[] = [];
  const declarations: VariableDeclaration[] = [];
  const names = new Set<string>(css.match(NAME_PATTERN) ?? []);

  postcss.parse(css).walkDecls((decl) => {
    const custom = decl.prop.startsWith('--');
    const reader = `${file} :: ${selectorOf(decl.parent)}${custom ? ` :: ${decl.prop}` : ''}`;

    reads.push(...findReads(decl.value, file, reader, custom ? decl.prop : undefined));

    // Every custom property is recorded, so reads can be followed through private ones such as
    // `--_hue`; the contract itself only looks at `--ng-doc-*` names.
    if (custom) {
      declarations.push({
        name: decl.prop,
        value: decl.value.trim(),
        context: contextOf(decl.parent),
        file,
        selector: selectorOf(decl.parent),
      });
    }
  });

  return { reads, declarations, names };
}

/**
 * Scans a TypeScript or HTML file as text: `var()` reads are reads, and every other mention of a
 * name (a `[style.--ng-doc-x]` binding, `setProperty('--ng-doc-x')`, an inline style) counts as a
 * local declaration.
 * @param text - File contents.
 * @param file - Workspace-relative path.
 */
export function scanSource(
  text: string,
  file: string,
): Omit<SurfaceScan, 'uncompiled' | 'imports'> {
  const reads = findReads(text, file);
  const names = new Set<string>(text.match(NAME_PATTERN) ?? []);
  const withoutReads = text.replace(/var\(\s*--[a-zA-Z0-9_-]*/g, 'var(');
  const declarations: VariableDeclaration[] = [...(withoutReads.match(NAME_PATTERN) ?? [])].map(
    (name) => ({ name, value: '', context: 'local', file, selector: '(binding)' }),
  );

  return { reads, declarations, names };
}

/**
 * Scans every style and source file of the given workspace folders.
 * @param folders - Workspace-relative folders, for example `libs/app`.
 * @param options - Folder names to skip.
 * @param options.skip - Directory names that are never entered (tests, fixtures).
 */
export function scanFolders(folders: string[], options: { skip?: string[] } = {}): SurfaceScan {
  const root = workspaceRoot();
  const skip = new Set(['node_modules', 'testing', ...(options.skip ?? [])]);
  const result: SurfaceScan = {
    reads: [],
    declarations: [],
    names: new Set(),
    uncompiled: [],
    imports: new Map(),
  };

  for (const folder of folders) {
    for (const file of walk(join(root, folder), skip)) {
      const path = relative(root, file).split(sep).join('/');
      const extension = extname(file);
      let scan: Omit<SurfaceScan, 'uncompiled' | 'imports'>;

      if (extension === '.scss') {
        try {
          const compiled = compileScssWithImports(file);

          result.imports.set(path, compiled.imports);
          scan = scanCss(compiled.css, path);
        } catch {
          // Partials that rely on variables or mixins of their importer cannot compile alone.
          // Their importer is compiled too, so the text scan only guards against missing a name.
          result.uncompiled.push(path);
          scan = scanSource(readFileSync(file, 'utf8'), path);
        }
      } else if (extension === '.css') {
        scan = scanCss(readFileSync(file, 'utf8'), path);
      } else if (extension === '.ts' || extension === '.html') {
        if (file.endsWith('.spec.ts')) {
          continue;
        }

        scan = scanSource(readFileSync(file, 'utf8'), path);
      } else {
        continue;
      }

      result.reads.push(...scan.reads);
      result.declarations.push(...scan.declarations);
      scan.names.forEach((name) => result.names.add(name));
    }
  }

  return result;
}

/**
 * Resolves a custom property against a set of declarations, substituting `var()` recursively and
 * evaluating `calc()` over px lengths. Returns the px value, or `undefined` if it is not a length.
 * @param name - Custom property to resolve.
 * @param scope - Declarations in cascade order (later entries win).
 */
export function resolveLength(name: string, scope: Map<string, string>): number | undefined {
  const value = substitute(name, scope, new Set());

  return value === undefined ? undefined : evaluateLength(value);
}

/**
 * The workspace root: the nearest folder with `nx.json` at or above the working directory. The specs
 * are bundled before they run, so their own location does not lead back to the sources.
 */
export function workspaceRoot(): string {
  let folder = process.cwd();

  while (!existsSync(join(folder, 'nx.json'))) {
    if (dirname(folder) === folder) throw new Error(`No nx.json above ${process.cwd()}`);
    folder = dirname(folder);
  }

  return folder;
}

/**
 * Substitutes `var()` references of a custom property recursively; cycles resolve to `undefined`.
 * @param name - Custom property to expand.
 * @param scope - Declarations to resolve against.
 * @param seen - Names already on the expansion path.
 */
function substitute(
  name: string,
  scope: Map<string, string>,
  seen: Set<string>,
): string | undefined {
  if (seen.has(name)) {
    return undefined;
  }

  const raw = scope.get(name);

  if (raw === undefined) {
    return undefined;
  }

  seen.add(name);

  let value = raw;
  const pattern = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^()]*))?\)/;

  for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
    const resolved = substitute(match[1], scope, new Set(seen)) ?? match[2]?.trim();

    if (resolved === undefined) {
      return undefined;
    }

    value =
      value.slice(0, match.index) + `(${resolved})` + value.slice(match.index + match[0].length);
  }

  return value;
}

/**
 * Evaluates `12px`, `calc(8px * 3)`, `(calc(8px * 2))` and similar expressions. Only px lengths and
 * unitless numbers are accepted; the result must carry the px unit.
 * @param expression - Expression after `var()` substitution.
 */
function evaluateLength(expression: string): number | undefined {
  const tokens = expression.replace(/calc\(/g, '(').match(/\d*\.?\d+(?:px)?|[-+*/()]|\S/g) ?? [];
  let position = 0;

  interface Quantity {
    value: number;
    px: boolean;
  }

  const primary = (): Quantity | undefined => {
    const token = tokens[position++];

    if (token === '(') {
      const inner = sum();

      return tokens[position++] === ')' ? inner : undefined;
    }

    if (token === '-') {
      const operand = primary();

      return operand && { value: -operand.value, px: operand.px };
    }

    const match = /^(\d*\.?\d+)(px)?$/.exec(token ?? '');

    return match ? { value: Number(match[1]), px: match[2] === 'px' } : undefined;
  };
  const product = (): Quantity | undefined => {
    let left = primary();

    while (left && (tokens[position] === '*' || tokens[position] === '/')) {
      const operator = tokens[position++];
      const right = primary();

      if (!right || (left.px && right.px) || (operator === '/' && right.px)) {
        return undefined;
      }

      left = {
        value: operator === '*' ? left.value * right.value : left.value / right.value,
        px: left.px || right.px,
      };
    }

    return left;
  };
  const sum = (): Quantity | undefined => {
    let left = product();

    while (left && (tokens[position] === '+' || tokens[position] === '-')) {
      const operator = tokens[position++];
      const right = product();

      if (!right || left.px !== right.px) {
        return undefined;
      }

      left = {
        value: operator === '+' ? left.value + right.value : left.value - right.value,
        px: left.px,
      };
    }

    return left;
  };

  const result = sum();

  return result && result.px && position === tokens.length ? result.value : undefined;
}

/**
 * The selector of the rule that holds a declaration, prefixed by its enclosing at-rules.
 * @param node - Parent node of the declaration.
 */
function selectorOf(node: unknown): string {
  const parts: string[] = [];

  for (let current = node as Rule | AtRule | undefined; current; ) {
    if (current instanceof Rule) {
      parts.unshift(current.selector.replace(/\s+/g, ' '));
    } else if (current instanceof AtRule) {
      parts.unshift(`@${current.name} ${current.params}`.replace(/\s+/g, ' '));
    }

    current = current.parent as Rule | AtRule | undefined;
  }

  return parts.join(' > ') || '(root)';
}

/**
 * Classifies the rule that holds a declaration.
 * @param node - Parent node of the declaration.
 */
function contextOf(node: unknown): ThemeContext {
  if (!(node instanceof Rule)) {
    return 'local';
  }

  // Sass drops the quotes of attribute selectors, so compare without them.
  const selector = node.selector.replace(/[\s"']+/g, '');

  if (selector === ':root') {
    return 'root';
  }

  if (selector === ':root[data-theme=dark]') {
    return 'dark';
  }

  if (
    selector === ':root[data-theme=auto]' &&
    node.parent instanceof AtRule &&
    node.parent.name === 'media' &&
    /prefers-color-scheme:\s*dark/.test(node.parent.params)
  ) {
    return 'auto';
  }

  return 'local';
}

/**
 * Lists the files of a directory tree in a stable order.
 * @param directory - Absolute directory to walk.
 * @param skip - Directory names that are not entered.
 */
function walk(directory: string, skip: Set<string>): string[] {
  return readdirSync(directory)
    .sort()
    .flatMap((entry) => {
      const path = join(directory, entry);

      if (!statSync(path).isDirectory()) {
        return [path];
      }

      return skip.has(entry) ? [] : walk(path, skip);
    });
}
