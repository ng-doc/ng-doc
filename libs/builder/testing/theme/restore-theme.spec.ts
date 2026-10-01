import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/** Runs a restore script with a stored theme id over an `index.html` default theme. */
function restore(script: string, stored: string | null, initial: string | null): string | null {
  const attributes = new Map<string, string>(initial === null ? [] : [['data-theme', initial]]);
  runInNewContext(readFileSync(script, 'utf8'), {
    localStorage: { getItem: (key: string) => (key === 'ng-doc-theme-id' ? stored : null) },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        removeAttribute: (name: string) => attributes.delete(name),
      },
    },
  });
  return attributes.get('data-theme') ?? null;
}

// Both engines inject their copy of the script into index.html.
describe.each([
  path.resolve(__dirname, '../../scripts/restore-theme.js'),
  path.resolve(__dirname, '../../generator/angular/restore-theme.js'),
])('restore-theme (%s)', (script) => {
  it('restores a stored theme', () => {
    expect(restore(script, 'dark', null)).toBe('dark');
    expect(restore(script, 'ocean', 'auto')).toBe('ocean');
  });

  it('restores the light theme over a default data-theme', () => {
    expect(restore(script, '', 'dark')).toBeNull();
  });

  it('keeps the default of index.html without a stored choice', () => {
    expect(restore(script, null, 'dark')).toBe('dark');
    expect(restore(script, null, null)).toBeNull();
  });
});
