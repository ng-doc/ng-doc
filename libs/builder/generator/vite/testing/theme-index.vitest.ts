import { describe, expect, it } from 'vitest';

import { createThemeIndexTransformer, transformNgDocIndex } from '../theme-index';

describe('theme index transformer', () => {
  it('loads the real restore script, injects exactly once and handles every head shape', async () => {
    const transform = await createThemeIndexTransformer(
      new URL('../restore-theme.js', import.meta.url),
    );
    const withHead = await transform('<html><head data-x="1"></head><body></body></html>');
    expect(withHead).toContain('<head data-x="1"><script data-ng-doc-theme-restore>');
    expect(withHead).toContain("localStorage.getItem('ng-doc-theme-id')");
    expect(await transform(withHead)).toBe(withHead);
    expect(withHead.match(/data-ng-doc-theme-restore/g) ?? []).toHaveLength(1);
    expect(await transform('<html><body>x</body></html>')).toContain(
      '<html><head><script data-ng-doc-theme-restore>',
    );
    expect(await transform('<!doctype html><body>x</body>')).toContain(
      '<!doctype html><head><script data-ng-doc-theme-restore>',
    );
    expect(await transform('<main>x</main>')).toMatch(/^<head><script data-ng-doc-theme-restore>/);
  });

  it('resolves the sibling restore script by default, as the plugin handler does', async () => {
    const html = '<!doctype html><html><head></head><body></body></html>';
    const first = await transformNgDocIndex(html);
    expect(first).toContain('<head><script data-ng-doc-theme-restore>');
    expect(first).toContain("localStorage.getItem('ng-doc-theme-id')");
    expect(await transformNgDocIndex(first)).toBe(first);
    expect(await (await createThemeIndexTransformer())(html)).toBe(first);
  });
});
