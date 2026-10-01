/**
 * @vitest-environment node
 */

import { join } from 'node:path';
import postcss, { Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

import { compileScss, scanCss, workspaceRoot } from './css-surface';
import { contrastRatio, parseColor, resolveValue, Rgba, Scope } from './css-values';

/**
 * WCAG 2.x floor for the word chips of the default theme: the kind chips (`ng-doc-kind-icon`), the
 * API header tags and the soft `ng-doc-tag` reach AA (4.5:1) on their own tint for every hue, in the
 * light, dark and auto themes.
 */

const AA = 4.5;
const HUES = [
  '--ng-doc-class-background',
  '--ng-doc-interface-background',
  '--ng-doc-enum-background',
  '--ng-doc-variable-background',
  '--ng-doc-function-background',
  '--ng-doc-type-alias-background',
  '--ng-doc-component-decorator-background',
  '--ng-doc-injectable-decorator-background',
  '--ng-doc-string-background',
  '--ng-doc-number-background',
  '--ng-doc-boolean-background',
  '--ng-doc-null-background',
  '--ng-doc-primary',
  '--ng-doc-success',
  '--ng-doc-warning',
  '--ng-doc-alert',
  '--ng-doc-info',
];

/** Chip rules: name, stylesheet, the end of the rule's selector and the hue variable it reads. */
const CHIPS: Array<[string, string, string, string]> = [
  [
    'kind chip',
    'libs/app/components/kind-icon/kind-icon.component.scss',
    ':host',
    '--ng-doc-kind-icon-background',
  ],
  [
    'API header tag',
    'libs/app/styles/parts/tags.scss',
    '.ng-doc-tag',
    '--ng-doc-css-tag-background',
  ],
];

const root = workspaceRoot();
const globalCss = compileScss(join(root, 'libs/app/styles/global.scss'));
const themeDeclarations = scanCss(
  compileScss(join(root, 'libs/app/styles/themes/dark.scss')),
  'libs/app/styles/themes/dark.scss',
).declarations;
const light: Scope = new Map(
  scanCss(globalCss, 'libs/app/styles/global.scss')
    .declarations.filter((declaration) => declaration.context === 'root')
    .map((declaration) => [declaration.name, declaration.value]),
);
const themes: Array<[string, Scope]> = [
  ['light', light],
  ['dark', withTheme('dark')],
  ['auto', withTheme('auto')],
];

describe.each(themes)('word chip contrast (%s)', (_theme: string, themeScope: Scope) => {
  describe.each(CHIPS)('%s', (_name: string, file: string, selector: string, hue: string) => {
    const css = compileScss(join(root, file));

    it.each(HUES)('text on the %s tint reaches AA', (value: string) => {
      const scope: Scope = new Map([...themeScope, [hue, `var(${value})`]]);
      const foreground = color(declaration(css, selector, 'color'), scope);
      const background = color(declaration(css, selector, 'background'), scope);

      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA);
    });
  });

  describe('soft ng-doc-tag', () => {
    const css = compileScss(join(root, 'libs/ui-kit/components/tag/tag.component.scss'));
    const soft = '[data-ng-doc-mod=light]';

    it.each(HUES)('text on the %s tint reaches AA', (value: string) => {
      const scope: Scope = new Map([...themeScope, ['--ng-doc-tag-background', `var(${value})`]]);
      const foreground = color(declaration(css, soft, '--ng-doc-tag-color'), scope);
      const background = color(declaration(css, soft, 'background'), scope);

      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA);
    });
  });
});

/**
 * The light scope with one dark-theme block applied on top.
 * @param context - `dark` for the explicit theme, `auto` for the `prefers-color-scheme` block.
 */
function withTheme(context: 'dark' | 'auto'): Scope {
  return new Map([
    ...light,
    ...themeDeclarations
      .filter((declaration) => declaration.context === context)
      .map((declaration): [string, string] => [declaration.name, declaration.value]),
  ]);
}

/**
 * The last value of a property in the rules whose selector ends with `selector`.
 * @param css - Compiled stylesheet.
 * @param selector - End of the rule's selector; quotes and spaces are ignored.
 * @param property - Property name.
 */
function declaration(css: string, selector: string, property: string): string {
  const normalize = (text: string): string => text.replace(/['"\s]/g, '');
  let value = '';

  postcss.parse(css).walkRules((rule: Rule) => {
    if (normalize(rule.selector).endsWith(normalize(selector))) {
      rule.walkDecls(property, (decl) => {
        value = decl.value;
      });
    }
  });

  expect(value).not.toBe('');

  return value;
}

/**
 * Resolves a CSS value to one colour.
 * @param value - CSS value.
 * @param scope - Declarations to resolve against.
 */
function color(value: string, scope: Scope): Rgba {
  const resolved = resolveValue(value, scope);
  const parsed = resolved === undefined ? undefined : parseColor(resolved);

  expect(parsed).toBeDefined();

  return parsed!;
}
