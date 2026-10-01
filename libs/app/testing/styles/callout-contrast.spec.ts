/**
 * @vitest-environment node
 */

import { join } from 'node:path';
import postcss, { Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

import { compileScss, scanCss, workspaceRoot } from './css-surface';
import { contrastRatio, parseColor, resolveValue, Rgba, Scope } from './css-values';

/**
 * WCAG 2.x floor for the callouts (`blockquote[ng-doc-blockquote]`) of the default theme: body
 * text, the type title and API links reach AA (4.5:1) on every tinted callout, and the icon reaches
 * the non-text 3:1, in the light, dark and auto themes.
 */

const AA = 4.5;
const NON_TEXT = 3;
const TYPES = ['note', 'warning', 'alert', 'success'] as const;

const root = workspaceRoot();
const globalCss = compileScss(join(root, 'libs/app/styles/global.scss'));
const calloutCss = compileScss(
  join(root, 'libs/ui-kit/components/blockquote/blockquote.component.scss'),
);
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

describe.each(themes)('callout contrast (%s)', (_theme: string, themeScope: Scope) => {
  describe.each(TYPES)('%s', (type: (typeof TYPES)[number]) => {
    const scope: Scope = new Map([...themeScope, ...typeDeclarations(type)]);
    const surface = (): Rgba => color(declaration(':host', 'background'), scope);

    it('body text reaches AA', () => {
      expect(contrastRatio(color('var(--ng-doc-text)', scope), surface())).toBeGreaterThanOrEqual(
        AA,
      );
    });

    it('the title reaches AA', () => {
      expect(
        contrastRatio(color(declaration('.ng-doc-blockquote-title', 'color'), scope), surface()),
      ).toBeGreaterThanOrEqual(AA);
    });

    it('an API link on its tint reaches AA', () => {
      // API links are code with a link-coloured tint (the inline code rule of the global styles).
      const linkScope: Scope = new Map([
        ...scope,
        ['--ng-doc-inline-code-background', 'var(--ng-doc-link-color)'],
      ]);
      const tint = color(inlineCodeBackground(), linkScope);
      const foreground = color(declaration('code.ng-doc-code-with-link a', 'color'), scope);

      expect(contrastRatio(foreground, blend(tint, surface()))).toBeGreaterThanOrEqual(AA);
    });

    it('the icon reaches 3:1', () => {
      expect(
        contrastRatio(color('var(--ng-doc-icon-color)', scope), surface()),
      ).toBeGreaterThanOrEqual(NON_TEXT);
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
 * The custom properties the callout sets for one type.
 * @param type - Callout type.
 */
function typeDeclarations(type: string): Array<[string, string]> {
  const declarations: Array<[string, string]> = [];

  postcss.parse(calloutCss).walkRules((rule: Rule) => {
    if (rule.selector.replace(/[\s'"]/g, '') === `:host[data-ng-doc-type=${type}]`) {
      rule.walkDecls((decl) => {
        declarations.push([decl.prop, decl.value]);
      });
    }
  });

  expect(declarations.length).toBeGreaterThan(0);

  return declarations;
}

/**
 * The value of a property in the callout rule whose selector ends with `selector`.
 * @param selector - End of the rule's selector.
 * @param property - Property name.
 */
function declaration(selector: string, property: string): string {
  let value = '';

  postcss.parse(calloutCss).walkRules((rule: Rule) => {
    if (rule.selector.trim().endsWith(selector)) {
      rule.walkDecls(property, (decl) => {
        value = decl.value;
      });
    }
  });

  expect(value).not.toBe('');

  return value;
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

/**
 * Paints a translucent colour over an opaque one.
 * @param tint - Translucent colour.
 * @param base - Opaque colour.
 */
function blend(tint: Rgba, base: Rgba): Rgba {
  const over = (top: number, bottom: number): number => top * tint.a + bottom * (1 - tint.a);

  return { r: over(tint.r, base.r), g: over(tint.g, base.g), b: over(tint.b, base.b), a: 1 };
}
