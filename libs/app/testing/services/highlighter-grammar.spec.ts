import { TestBed } from '@angular/core/testing';
import { NgDocHighlighterService } from '@ng-doc/app/services/highlighter';
import { NG_DOC_SHIKI_THEME } from '@ng-doc/app/tokens';
import { NG_DOC_SYNTAX_THEME_NAME } from '@ng-doc/core/constants/syntax-theme';
import { beforeEach, describe, expect, it } from 'vitest';

// The real Shiki of the browser highlighter: playgrounds highlight Angular templates with the
// grammars that the code blocks were highlighted with when the site was built.

/** The colour each token gets from NgDoc's theme, by the token's text. */
function colours(html: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, colour, token] of html.matchAll(
    /<span style="color:var\(--ng-doc-syntax-([a-z]+)\)[^"]*">([^<]*)<\/span>/g,
  ))
    tokens.set(token!.trim(), colour!);
  return tokens;
}

describe('NgDocHighlighterService grammars', () => {
  beforeEach(() => {
    Reflect.deleteProperty(NgDocHighlighterService, 'defaultInitialization');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NG_DOC_SHIKI_THEME,
          useValue: { light: NG_DOC_SYNTAX_THEME_NAME, dark: NG_DOC_SYNTAX_THEME_NAME },
        },
      ],
    });
  });

  it('highlights @let and the control flow blocks as template blocks', async () => {
    const service = TestBed.inject(NgDocHighlighterService);
    await service.initialize();

    const tokens = colours(
      service.highlight(
        [
          '@let total = price * count;',
          '@if (total > 0) {',
          '  <b>{{ total }}</b>',
          '} @else {',
          '  @for (item of items; track item) { <i>{{ item }}</i> }',
          '}',
          '@defer (on viewport) { <app-chart /> }',
        ].join('\n'),
      ),
    );

    for (const block of ['@let', '@if', '@else', '@for', '@defer'])
      expect(tokens.get(block), block).toBe('keyword');
    expect(tokens.get('b')).toBe('tag');
  });

  it('replaces a language with a registration of the same name', async () => {
    const service = TestBed.inject(NgDocHighlighterService);
    await service.initialize({
      langs: [
        {
          name: 'angular-html',
          scopeName: 'text.html.derivative.ng',
          patterns: [{ match: '\\bhello\\b', name: 'keyword.control.test' }],
          repository: {},
        },
      ],
    });

    expect(colours(service.highlight('hello <b>world</b>')).get('hello')).toBe('keyword');
  });
});
