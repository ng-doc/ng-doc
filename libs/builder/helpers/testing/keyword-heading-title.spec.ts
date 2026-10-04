import { NgDocPageAnchor } from '@ng-doc/core';
import { describe, expect, it } from 'vitest';

import { constructPageKeyword } from '../construct-page-keyword';
import { keywordHeadingTitle } from '../keyword-heading-title';

const NBSP = ' ';

/**
 * A heading anchor as the slugger reports it.
 * @param title - The heading text.
 * @param anchor - The anchor.
 * @returns The anchor.
 */
function heading(title: string, anchor: string): NgDocPageAnchor {
  return { anchor, anchorId: anchor, title, type: 'heading' };
}

describe('keywordHeadingTitle', () => {
  it.each([
    [`🎨${NBSP}Custom theme`, 'Custom theme'],
    ['🚀 Start here', 'Start here'],
    [`❤️${NBSP}Thanks`, 'Thanks'],
    [`👍🏽${NBSP}Approved`, 'Approved'],
    [`🧑‍💻${NBSP}Developers`, 'Developers'],
    [`🇺🇦${NBSP}Flags`, 'Flags'],
  ])('drops the leading emoji of %j', (title, expected) => {
    expect(keywordHeadingTitle(title)).toBe(expected);
  });

  it.each([
    'Custom theme',
    'Theme 🎨',
    '© 2026 Notice',
    '1. Add the Vite configuration',
    '#1 Priority',
    '🎨',
  ])('keeps %j', (title) => {
    expect(keywordHeadingTitle(title)).toBe(title);
  });
});

describe('constructPageKeyword', () => {
  it('titles a heading keyword without its leading emoji', () => {
    expect(
      constructPageKeyword(
        '*ThemesAndColorsPage',
        'Themes and colors',
        'docs/customize/themes-and-colors',
        heading(`🎨${NBSP}Custom theme`, 'custom-theme'),
      ),
    ).toEqual({
      key: '*ThemesAndColorsPage#custom-theme',
      title: 'Themes and colors [Custom theme]',
      path: 'docs/customize/themes-and-colors#custom-theme',
    });
  });

  it('keeps member titles as they are', () => {
    expect(
      constructPageKeyword('Thing', 'Thing', 'api/thing', {
        anchor: 'member',
        anchorId: 'member',
        title: '🎨 member',
        type: 'member',
      }).title,
    ).toBe('Thing.🎨 member');
  });
});
