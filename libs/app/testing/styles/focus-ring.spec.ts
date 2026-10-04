/**
 * @vitest-environment node
 */

import { join } from 'node:path';
import postcss, { Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

import { compileScss, workspaceRoot } from './css-surface';

/**
 * Controls whose native element is visually hidden must draw the keyboard focus ring on a visible
 * part: the stylesheet has to hold a `:focus-visible` rule that sets the ring. jsdom cannot match
 * `:focus-visible`, so this checks the rules themselves.
 */

const root = workspaceRoot();

/** Stylesheet, the selector that must exist, and the declaration it must set. */
const RINGS: Array<[string, string, string, string]> = [
  [
    'checkbox (the box shows the ring of its hidden input)',
    'libs/ui-kit/components/checkbox/checkbox.component.scss',
    '.ng-doc-checkbox:has(input:focus-visible)',
    'var(--ng-doc-focus-ring)',
  ],
  [
    'text field (the frame shows the ring of its input)',
    'libs/ui-kit/components/input-wrapper/input-wrapper.component.scss',
    '.ng-doc-input-container:has(.ng-doc-input:focus-visible)',
    'var(--ng-doc-focus-ring)',
  ],
];

describe('keyboard focus rings', () => {
  it.each(RINGS)('%s', (_name: string, file: string, selector: string, value: string) => {
    const shadows: string[] = [];

    postcss.parse(compileScss(join(root, file))).walkRules((rule: Rule) => {
      if (rule.selectors.some((item: string) => item.replace(/\s+/g, ' ').endsWith(selector))) {
        rule.walkDecls('box-shadow', (decl) => {
          shadows.push(decl.value);
        });
      }
    });

    expect(shadows).toContain(value);
  });
});
