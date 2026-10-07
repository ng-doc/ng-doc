import { afterEach, expect, test, vi } from 'vitest';

import { formatCode } from '../../../helpers/format-code';
import type { GenerationFormatCache as FormatCodeCache } from '../formatting';
import { formatting, useFormatCache } from '../formatting';

// The semantic service formats signatures and snippets through `formatting`, which installs the
// cache the compiler set for the generation (`content/format-cache.ts`), and none otherwise.

afterEach(() => useFormatCache(undefined));

test('formatting installs the generation cache for the formatCode calls it makes', () => {
  const cache: FormatCodeCache = {
    config: vi.fn(() => ({ semi: false })),
    format: vi.fn(() => 'cached'),
  };
  useFormatCache(cache);
  expect(formatting(() => formatCode('const a = 1', 'TypeScript', '/workspace'))).toBe('cached');
  expect(cache.config).toHaveBeenCalledWith('/workspace', expect.any(Function));
  expect(cache.format).toHaveBeenCalledWith(
    { code: 'const a = 1', parser: 'typescript', config: { semi: false } },
    expect.any(Function),
  );
  // Outside `formatting`, and after the compile cleared it, nothing is cached.
  expect(formatCode('const a = 1', 'TypeScript', '/workspace')).toBe('const a = 1;');
  useFormatCache(undefined);
  expect(formatting(() => formatCode('const a = 1', 'TypeScript', '/workspace'))).toBe(
    'const a = 1;',
  );
  expect(cache.format).toHaveBeenCalledOnce();
});
