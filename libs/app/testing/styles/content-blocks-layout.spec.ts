/**
 * @vitest-environment node
 */

import { join } from 'node:path';
import postcss, { Declaration, Root } from 'postcss';
import { describe, expect, it } from 'vitest';

import { compileScss, workspaceRoot } from './css-surface';

/**
 * Layout rules of content blocks that jsdom cannot check: it neither lays text out nor matches
 * `:hover`, so these read the compiled rules themselves.
 */

const root = workspaceRoot();

/**
 * Compiles and parses a stylesheet.
 * @param file - The stylesheet, relative to the workspace root.
 * @returns The parsed stylesheet.
 */
function parse(file: string): Root {
  return postcss.parse(compileScss(join(root, file)));
}

/**
 * Collects the declarations of a property.
 * @param sheet - The parsed stylesheet.
 * @param property - The property name.
 * @returns Every declaration of the property.
 */
function declarations(sheet: Root, property: string): Declaration[] {
  const found: Declaration[] = [];

  sheet.walkDecls(property, (decl) => {
    found.push(decl);
  });

  return found;
}

/**
 * Reads the selector of the rule that holds a declaration.
 * @param decl - The declaration.
 * @returns The selector, or an empty string outside a rule.
 */
function selectorOf(decl: Declaration): string {
  const parent = decl.parent;

  return parent && parent.type === 'rule'
    ? (parent as unknown as { selector: string }).selector
    : '';
}

describe('content block layout', () => {
  it('lets page links wrap, so long page titles stay inside a phone-width column', () => {
    const sheet = parse('libs/app/components/page-link/page-link.component.scss');

    expect(declarations(sheet, 'white-space').map((decl) => decl.value)).not.toContain('nowrap');
  });

  it('draws Mermaid diagrams on the code block surface', () => {
    const sheet = parse('libs/app/components/mermaid-viewer/mermaid-viewer.component.scss');
    const backgrounds = declarations(sheet, 'background').filter(
      (decl) => selectorOf(decl) === ':host',
    );

    expect(backgrounds.map((decl) => decl.value)).toEqual([
      'var(--ng-doc-mermaid-viewer-background, var(--ng-doc-code-background))',
    ]);
  });

  it('shows the Mermaid zoom controls over the diagram only on hover, focus or touch screens', () => {
    const sheet = parse('libs/app/components/mermaid-viewer/mermaid-viewer.component.scss');
    const opacity = declarations(sheet, 'opacity').map((decl) => {
      const parent = decl.parent?.parent;
      const media =
        parent && parent.type === 'atrule' ? `@${(parent as { params?: string }).params} ` : '';

      return `${media}${selectorOf(decl).replace(/\s+/g, ' ')} => ${decl.value}`;
    });

    expect(opacity).toEqual([
      ':host ng-doc-magnifier-controller => 0',
      '@(hover: none) :host ng-doc-magnifier-controller => 1',
      ':host:hover ng-doc-magnifier-controller, :host:focus-within ng-doc-magnifier-controller => 1',
    ]);
  });
});
