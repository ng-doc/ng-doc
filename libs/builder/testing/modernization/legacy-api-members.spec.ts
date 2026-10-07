import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import { renderTemplate } from '../../engine/nunjucks/render-template';

/** The legacy engine's API page of `Derived`, rendered as `api-page-template.builder.ts` does. */
function legacyApiPage(extra: Record<string, unknown> = {}): string {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    'api.ts',
    [
      'export class Base {',
      '  /** Shown. */ visibleValue = 1;',
      '  /** Guarded. */ protected guardedValue = 2;',
      '  /** Guarded method. */ protected guardedMethod(): void {}',
      '}',
      'export class Derived extends Base {',
      '  /** Own guarded. */ protected ownGuarded = 3;',
      '}',
    ].join('\n'),
  );
  const declaration = source.getClassOrThrow('Derived');
  return renderTemplate('./api-page-content.html.nunj', {
    context: {
      declaration,
      docNode: declaration,
      templateName: 'class-declaration',
      scope: undefined,
      ...extra,
    },
  });
}

describe('the legacy API page of a class', () => {
  it('keeps protected members, inherited ones included (the legacy engine passes no option)', () => {
    const html = legacyApiPage();
    for (const name of ['visibleValue', 'guardedValue', 'guardedMethod', 'ownGuarded']) {
      expect(html).toContain(name);
    }
  });

  it('lists public members only when the new engine hides protected members', () => {
    const html = legacyApiPage({ hideProtectedMembers: true });
    expect(html).toContain('visibleValue');
    for (const name of ['guardedValue', 'guardedMethod', 'ownGuarded']) {
      expect(html).not.toContain(name);
    }
  });
});
