/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { scanFolders } from './css-surface';

/**
 * A misspelled prefix (`--ng-dpc-icon-height`) reads a variable nobody sets, so the fallback wins
 * silently and a user override never applies. Every NgDoc-looking custom property the libraries
 * read or declare must use the public `--ng-doc-` prefix.
 */
describe('custom property prefix', () => {
  const scan = scanFolders(['libs/app', 'libs/ui-kit']);
  const misspelled = (name: string): boolean =>
    /^--ng[-_]?d/i.test(name) && !name.startsWith('--ng-doc-');

  it('reads no custom property with a misspelled NgDoc prefix', () => {
    expect(
      scan.reads.filter(({ name }) => misspelled(name)).map(({ name, file }) => `${file}: ${name}`),
    ).toEqual([]);
  });

  it('declares no custom property with a misspelled NgDoc prefix', () => {
    expect(
      scan.declarations
        .filter(({ name }) => misspelled(name))
        .map(({ name, file }) => `${file}: ${name}`),
    ).toEqual([]);
  });

  it('sizes a 24px icon from --ng-doc-icon-width and --ng-doc-icon-height', () => {
    const icon = scan.reads.filter(({ file }) => file.endsWith('icon/icon.component.scss'));

    expect(icon.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['--ng-doc-icon-width', '--ng-doc-icon-height']),
    );
    expect(icon.filter(({ name }) => name === '--ng-doc-icon-height')).toHaveLength(2);
  });
});
