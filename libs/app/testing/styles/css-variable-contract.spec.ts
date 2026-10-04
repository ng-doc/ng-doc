/**
 * @vitest-environment node
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  compileScss,
  NG_DOC_PREFIX,
  resolveLength,
  scanCss,
  scanFolders,
  SurfaceScan,
  VariableDeclaration,
  withoutImportedDuplicates,
  workspaceRoot,
} from './css-surface';
import { resolveVariable } from './css-values';

/**
 * The CSS custom properties are public API: the docs tell users they can override any of them. This
 * contract keeps every existing name working while the default theme changes underneath it.
 */

interface VariableEntry {
  group?: string;
  documented?: boolean;
  note?: string;
  reason?: string;
}

interface PublicVariables {
  declared: Record<string, VariableEntry>;
  hooks: Record<string, VariableEntry>;
  local: Record<string, VariableEntry>;
  additive: Record<string, VariableEntry>;
  aliases: Record<string, VariableEntry>;
  retired: Record<string, VariableEntry>;
}

const CATEGORIES = ['declared', 'hooks', 'local', 'additive', 'aliases', 'retired'] as const;

/** Variables consumed as lengths (for example by `min-height` in `NgDocTextComponent`). */
const LENGTH_VARIABLES = ['--ng-doc-line-height', '--ng-doc-font-size'];

/**
 * Public variables the libraries declare but never read, directly or through another custom
 * property. Each entry needs a reason; a key ending in `*` covers a family by prefix. A name that is
 * read again must leave this list, and a public variable that stops being read fails the contract
 * unless it is added here on purpose.
 */
const UNUSED_LEGACY = 'declared before the refresh; kept because users may read it';
const TEXT_ON_SOLID_FILL = 'text on a solid fill; chips and tags use the hue only as a tint';
const PRIMITIVE =
  'primitive ramp step; the defaults read only some steps, user themes may read others';
const SCALE =
  'scale token for the refreshed components; remove the entry when a component reads it';
const DERIVED = 'derived token for callouts, tags and active states restyled after the foundation';
const SYNTAX_THEME = 'read by the inline styles of code highlighted with the css-variables theme';

const UNREAD: Record<string, string> = {
  // Kept from before the refresh for users who read them in their own styles; nothing in the
  // libraries does.
  '--ng-doc-black': UNUSED_LEGACY,
  // Token layer: primitives and scales.
  '--ng-doc-palette-*': PRIMITIVE,
  '--ng-doc-space-*': SCALE,
  '--ng-doc-text-xs-*': SCALE,
  '--ng-doc-text-sm-*': SCALE,
  '--ng-doc-text-lg-*': SCALE,
  // Derived tokens.
  '--ng-doc-info-soft': DERIVED,
  '--ng-doc-info-border': DERIVED,
  '--ng-doc-info-strong': DERIVED,
  '--ng-doc-success-soft': DERIVED,
  '--ng-doc-success-border': DERIVED,
  '--ng-doc-warning-soft': DERIVED,
  '--ng-doc-warning-border': DERIVED,
  '--ng-doc-warning-strong': DERIVED,
  '--ng-doc-alert-soft': DERIVED,
  '--ng-doc-alert-border': DERIVED,
  '--ng-doc-alert-strong': DERIVED,
  '--ng-doc-hue-red': DERIVED,
  // Syntax colours: the css-variables highlighting theme (`ngDocSyntaxTheme` in @ng-doc/core)
  // reads them from the inline styles of highlighted code, never from a stylesheet.
  '--ng-doc-syntax-*': SYNTAX_THEME,
  // Text on a solid fill of a kind, type, decorator or modifier colour. Chips and tags use only the
  // `*-background` hue, as a tint (the colour mixins are included with `$color-prop: null`).
  // Modifier tags are outlined, and their hue only tints the ring.
  '--ng-doc-on-hue': TEXT_ON_SOLID_FILL,
  '--ng-doc-abstract-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-async-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-overriden-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-protected-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-readonly-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-static-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-boolean-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-class-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-component-decorator-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-directive-decorator-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-enum-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-function-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-get-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-injectable-decorator-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-input-decorator-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-interface-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-ng-module-decorator-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-null-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-number-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-object-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-output-decorator-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-pipe-decorator-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-selector-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-set-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-string-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-type-alias-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-undefined-color': TEXT_ON_SOLID_FILL,
  '--ng-doc-variable-color': TEXT_ON_SOLID_FILL,
};

const root = workspaceRoot();
const here = join(root, 'libs/app/testing/styles');
const contract: PublicVariables = JSON.parse(
  readFileSync(join(here, 'public-variables.json'), 'utf8'),
);

let libraries: SurfaceScan;
let site: SurfaceScan;
let globalDeclarations: VariableDeclaration[];
let themeDeclarations: VariableDeclaration[];

beforeAll(() => {
  libraries = scanFolders(['libs/app', 'libs/ui-kit']);
  site = scanFolders(['apps/ng-doc/src']);
  globalDeclarations = scanCss(
    compileScss(join(root, 'libs/app/styles/global.scss')),
    'libs/app/styles/global.scss',
  ).declarations;
  themeDeclarations = scanCss(
    compileScss(join(root, 'libs/app/styles/themes/dark.scss')),
    'libs/app/styles/themes/dark.scss',
  ).declarations;
});

describe('CSS variable contract', () => {
  it('lists every name in exactly one category', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const category of CATEGORIES) {
      for (const name of Object.keys(contract[category])) {
        const previous = seen.get(name);

        if (previous) {
          duplicates.push(`${name} (${previous}, ${category})`);
        }

        seen.set(name, category);
      }
    }

    expect(duplicates).toEqual([]);
  });

  it('declares every public and additive variable on :root', () => {
    const declared = rootNames();
    const missing = [...Object.keys(contract.declared), ...Object.keys(contract.additive)].filter(
      (name) => !declared.has(name),
    );

    expect(missing).toEqual([]);
  });

  it('keeps reading every hook variable', () => {
    const read = new Set(libraries.reads.map((read) => read.name));
    const missing = Object.keys(contract.hooks).filter((name) => !read.has(name));

    expect(missing).toEqual([]);
  });

  it('keeps every component-local variable', () => {
    const mentioned = new Set([...libraries.names, ...site.names]);
    const missing = Object.keys(contract.local).filter((name) => !mentioned.has(name));

    expect(missing).toEqual([]);
  });

  it('reads aliases first and never declares them', () => {
    const read = new Set(libraries.reads.map((read) => read.name));
    const declared = new Set(
      [...libraries.declarations, ...globalDeclarations, ...themeDeclarations].map(
        (declaration) => declaration.name,
      ),
    );
    const problems = Object.keys(contract.aliases).flatMap((name) => [
      ...(read.has(name) ? [] : [`${name} is not read`]),
      ...(declared.has(name) ? [`${name} is declared`] : []),
    ]);

    expect(problems).toEqual([]);
  });

  it('no longer reads retired variables', () => {
    const offenders = libraries.reads
      .filter((read) => read.name in contract.retired)
      .map((read) => `${read.name} in ${read.file}`);

    expect(offenders).toEqual([]);
  });

  it('lists every variable the libraries mention', () => {
    const known = new Set(CATEGORIES.flatMap((category) => Object.keys(contract[category])));
    const unknown = [...libraries.names].filter((name) => !known.has(name)).sort();

    // A new name is a change of the public surface: add it to public-variables.json.
    expect(unknown).toEqual([]);
  });

  it('reads no undeclared variable without a fallback', () => {
    const declared = new Set([
      ...rootNames(),
      ...libraries.declarations.map((declaration) => declaration.name),
    ]);
    const offenders = libraries.reads
      .filter((read) => read.name.startsWith(NG_DOC_PREFIX) && !read.hasFallback)
      .filter((read) => !declared.has(read.name) && !(read.name in contract.hooks))
      .map((read) => `${read.name} in ${read.file}`);

    expect([...new Set(offenders)]).toEqual([]);
  });

  it('declares the same overrides for the dark and the auto theme', () => {
    const dark = themeScope('dark');
    const auto = themeScope('auto');

    expect(dark.size).toBeGreaterThan(0);
    expect(Object.fromEntries(auto)).toEqual(Object.fromEntries(dark));
  });

  it('reads every public variable, directly or through another custom property', () => {
    const used = usedNames();
    const unread = publicNames().filter((name) => !used.has(name) && !isUnreadOnPurpose(name));
    const readAgain = Object.keys(UNREAD).filter((key) =>
      key.endsWith('*')
        ? !Object.keys(contract.additive).some(
            (name) => name.startsWith(key.slice(0, -1)) && !used.has(name),
          )
        : used.has(key),
    );

    expect({ unread, readAgain }).toEqual({ unread: [], readAgain: [] });
  });

  it('keeps every place that reads a variable', () => {
    // A component that stops reading a public variable ignores users' overrides of it. Adding or
    // removing a reader updates variable-readers.json, so the change is reviewed.
    const readers = new Map<string, Set<string>>();

    for (const read of libraries.reads) {
      if (read.name.startsWith(NG_DOC_PREFIX)) {
        readers.set(read.name, (readers.get(read.name) ?? new Set()).add(read.reader));
      }
    }

    expectRecorded(
      'variable-readers.json',
      Object.fromEntries(
        [...readers.keys()]
          .sort()
          .map((name) => [
            name,
            withoutImportedDuplicates([...readers.get(name)!], libraries.imports).sort(),
          ]),
      ),
    );
  });

  it('keeps every local declaration of a public variable', () => {
    // A component that sets a public variable to a literal overrides the user's value in its
    // subtree. New local declarations update variable-declarations.json, so they are reviewed.
    const publicSet = new Set([
      ...Object.keys(contract.declared),
      ...Object.keys(contract.hooks),
      ...Object.keys(contract.additive),
    ]);
    const declarations = new Map<string, Set<string>>();

    for (const declaration of libraries.declarations) {
      if (declaration.context === 'local' && publicSet.has(declaration.name)) {
        const entry = `${declaration.file} :: ${declaration.selector} = ${declaration.value}`;

        declarations.set(
          declaration.name,
          (declarations.get(declaration.name) ?? new Set()).add(entry),
        );
      }
    }

    expectRecorded(
      'variable-declarations.json',
      Object.fromEntries(
        [...declarations.keys()]
          .sort()
          .map((name) => [
            name,
            withoutImportedDuplicates([...declarations.get(name)!], libraries.imports).sort(),
          ]),
      ),
    );
  });

  it('resolves every public variable to the recorded value in each theme', () => {
    // Values after var() substitution and color-mix(); dark and auto list only what differs from
    // light. A new default updates variable-values.json, so the change is reviewed.
    const light = rootScope();
    const resolve = (scope: Map<string, string>): Record<string, string> =>
      Object.fromEntries(
        publicNames().map((name) => [name, resolveVariable(name, scope) ?? '(invalid)']),
      );
    const differences = (theme: Record<string, string>, base: Record<string, string>) =>
      Object.fromEntries(Object.entries(theme).filter(([name, value]) => base[name] !== value));
    const lightValues = resolve(light);

    expectRecorded('variable-values.json', {
      light: lightValues,
      dark: differences(resolve(new Map([...light, ...themeScope('dark')])), lightValues),
      auto: differences(resolve(new Map([...light, ...themeScope('auto')])), lightValues),
    });
  });

  it.each(LENGTH_VARIABLES)('keeps %s a length in every theme', (name) => {
    const light = rootScope();
    const dark = new Map([...light, ...themeScope('dark')]);
    const auto = new Map([...light, ...themeScope('auto')]);

    expect(resolveLength(name, light)).toBeGreaterThan(0);
    expect(resolveLength(name, dark)).toBeGreaterThan(0);
    expect(resolveLength(name, auto)).toBeGreaterThan(0);
  });
});

describe('resolveLength', () => {
  const scope = new Map([
    ['--ng-doc-base-gutter', '8px'],
    ['--ng-doc-a', 'calc(var(--ng-doc-base-gutter) * 3)'],
    ['--ng-doc-b', 'var(--ng-doc-a)'],
    ['--ng-doc-c', 'var(--ng-doc-missing, 12px)'],
    ['--ng-doc-d', '1.5'],
    ['--ng-doc-e', 'calc(var(--ng-doc-base-gutter) + 2px - 1px)'],
  ]);

  it.each([
    ['--ng-doc-a', 24],
    ['--ng-doc-b', 24],
    ['--ng-doc-c', 12],
    ['--ng-doc-e', 9],
  ])('resolves %s to %ipx', (name, expected) => {
    expect(resolveLength(name, scope)).toBe(expected);
  });

  it('rejects unitless values', () => {
    expect(resolveLength('--ng-doc-d', scope)).toBeUndefined();
  });
});

/**
 * Compares a value with its recorded JSON next to this spec. With `NGDOC_UPDATE_CSS_CONTRACT=1` the
 * file is rewritten instead (`NGDOC_UPDATE_CSS_CONTRACT=1 npx nx test app --skip-nx-cache`); commit it with the change that caused the difference.
 * @param file - File name next to this spec.
 * @param actual - Current value.
 */
function expectRecorded(file: string, actual: unknown): void {
  const path = join(here, file);

  if (process.env['NGDOC_UPDATE_CSS_CONTRACT'] === '1') {
    // CI must compare, never record.
    if (process.env['CI']) {
      throw new Error('NGDOC_UPDATE_CSS_CONTRACT is not allowed when CI is set.');
    }

    writeFileSync(path, JSON.stringify(actual, null, 2) + '\n');
  }

  expect(existsSync(path)).toBe(true);
  expect(actual).toEqual(JSON.parse(readFileSync(path, 'utf8')));
}

/** Declared and additive variables: the names the libraries give a value on `:root`. */
function publicNames(): string[] {
  return [...Object.keys(contract.declared), ...Object.keys(contract.additive)].sort();
}

/**
 * Whether a name is allowed to stay unread.
 * @param name - Custom property.
 */
function isUnreadOnPurpose(name: string): boolean {
  // A family entry covers additive tokens only, so it can never hide a public variable.
  return Object.keys(UNREAD).some((key) =>
    key.endsWith('*')
      ? name in contract.additive && name.startsWith(key.slice(0, -1))
      : key === name,
  );
}

/**
 * Names the libraries read: directly from a regular property or a TypeScript/HTML source, or
 * through the value of a custom property that is itself read.
 */
function usedNames(): Set<string> {
  const definitions = new Map<string, string[]>();
  const used = new Set<string>();
  const pending: string[] = [];

  for (const read of libraries.reads) {
    if (read.via) {
      definitions.set(read.via, [...(definitions.get(read.via) ?? []), read.name]);
    } else if (!used.has(read.name)) {
      used.add(read.name);
      pending.push(read.name);
    }
  }

  for (let name = pending.pop(); name; name = pending.pop()) {
    for (const next of definitions.get(name) ?? []) {
      if (!used.has(next)) {
        used.add(next);
        pending.push(next);
      }
    }
  }

  return used;
}

/** Names declared on `:root` by the global stylesheet. */
function rootNames(): Set<string> {
  return new Set(rootScope().keys());
}

/** Light-theme `:root` declarations of the global stylesheet. */
function rootScope(): Map<string, string> {
  return new Map(
    globalDeclarations
      .filter((declaration) => declaration.context === 'root')
      .map((declaration) => [declaration.name, declaration.value]),
  );
}

/**
 * Declarations of one dark-theme block of the theme stylesheet.
 * @param context - `dark` for the explicit theme, `auto` for the `prefers-color-scheme` block.
 */
function themeScope(context: 'dark' | 'auto'): Map<string, string> {
  return new Map(
    themeDeclarations
      .filter((declaration) => declaration.context === context)
      .map((declaration) => [declaration.name, declaration.value]),
  );
}
