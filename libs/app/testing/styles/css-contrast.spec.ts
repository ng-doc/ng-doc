/**
 * @vitest-environment node
 */

import { join } from 'node:path';
import postcss, { Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

import { compileScss, scanCss, workspaceRoot } from './css-surface';
import {
  contrastRatio,
  parseColor,
  resolveValue,
  resolveVariable,
  Rgba,
  Scope,
} from './css-values';

/**
 * WCAG 2.x floor for the default theme: the text pairs every page shows must reach AA (4.5:1) in
 * the light, dark and auto themes. User themes are their own responsibility.
 */

const AA = 4.5;

interface Pair {
  name: string;
  foreground: (scope: Scope) => Rgba | undefined;
  background: (scope: Scope) => Rgba | undefined;
}

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

const variable =
  (name: string) =>
  (scope: Scope): Rgba | undefined =>
    color(resolveVariable(name, scope));
const page = variable('--ng-doc-background');

const PAIRS: Pair[] = [
  { name: 'body text / page', foreground: variable('--ng-doc-text'), background: page },
  { name: 'heading / page', foreground: variable('--ng-doc-heading-color'), background: page },
  { name: 'muted text / page', foreground: variable('--ng-doc-text-muted'), background: page },
  {
    name: 'muted text / base-2',
    foreground: variable('--ng-doc-text-muted'),
    background: variable('--ng-doc-base-2'),
  },
  {
    name: 'primary text / primary',
    foreground: variable('--ng-doc-primary-text'),
    background: variable('--ng-doc-primary'),
  },
  { name: 'link / page', foreground: variable('--ng-doc-link-color'), background: page },
  {
    name: 'inline code / its tint on the page',
    foreground: variable('--ng-doc-inline-code-color'),
    // The tint is declared by the inline code rule itself, so it is read from the stylesheet.
    background: (scope: Scope) => {
      const tint = color(resolveValue(inlineCodeBackground(), scope));
      const base = page(scope);

      return tint && base ? blend(tint, base) : undefined;
    },
  },
];

describe.each(themes)('default theme contrast (%s)', (_theme, scope) => {
  it.each(PAIRS.map((pair) => [pair.name, pair] as const))('%s reaches AA', (_name, pair) => {
    const foreground = pair.foreground(scope);
    const background = pair.background(scope);

    expect(foreground).toBeDefined();
    expect(background).toBeDefined();
    expect(contrastRatio(foreground!, background!)).toBeGreaterThanOrEqual(AA);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio(parseColor('#000')!, parseColor('#fff')!)).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColor('#777')!, parseColor('#fff')!)).toBeCloseTo(4.48, 2);
  });

  it('composites a translucent foreground over the background', () => {
    expect(contrastRatio(parseColor('#00000000')!, parseColor('#fff')!)).toBeCloseTo(1, 5);
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

/** The `background` of the inline code rule (`*:not(pre) > code.ngde`) in the global stylesheet. */
function inlineCodeBackground(): string {
  let value = '';

  postcss.parse(globalCss).walkRules((rule: Rule) => {
    if (rule.selector.includes(':not(pre)') && rule.selector.includes('code.ngde')) {
      rule.walkDecls('background', (decl) => {
        value = decl.value;
      });
    }
  });

  return value;
}

/**
 * Parses a resolved value that must be a single colour.
 * @param value - Resolved value.
 */
function color(value: string | undefined): Rgba | undefined {
  return value === undefined ? undefined : parseColor(value);
}

/**
 * Paints a translucent background over the page, keeping the result opaque.
 * @param tint - Translucent colour.
 * @param base - Opaque page colour.
 */
function blend(tint: Rgba, base: Rgba): Rgba {
  const over = (top: number, bottom: number): number => top * tint.a + bottom * (1 - tint.a);

  return { r: over(tint.r, base.r), g: over(tint.g, base.g), b: over(tint.b, base.b), a: 1 };
}
