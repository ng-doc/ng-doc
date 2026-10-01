/** @vitest-environment node */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { EOL, tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markdownToHtml } from '../markdown-to-html';

// Windows: the platform line ending is CRLF. Line ranges must not depend on it, and must select
// what the new engine selects (content/testing/snippet-line-endings.vitest.ts).
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, EOL: '\r\n' };
});

// The ESM utilities are loaded at builder start; entity encoding of the metadata is not under test.
vi.mock('../utils', () => ({ UTILS: { stringifyEntities: (value: string) => value } }));

describe('markdownToHtml line-ranged snippets on a CRLF platform', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'ng-doc-legacy-eol-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const render = (separator: string): string => {
    writeFileSync(
      path.join(root, 'range.ts'),
      ['zeroLine();', 'firstLine();', 'secondLine();', 'thirdLine();'].join(separator),
    );
    return markdownToHtml('```ts file="range.ts"#L2-L3\nfallback\n```\n', root);
  };

  it.each([
    ['an LF file', '\n'],
    ['a CRLF file', '\r\n'],
  ])('selects the same lines of %s', (_, separator) => {
    expect(EOL).toBe('\r\n');
    const html = render(separator);
    expect(html).toContain('firstLine');
    expect(html).toContain('secondLine');
    expect(html).not.toContain('zeroLine');
    expect(html).not.toContain('thirdLine');
  });
});
