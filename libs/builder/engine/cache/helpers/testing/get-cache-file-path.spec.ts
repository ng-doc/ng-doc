import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCacheFilePath } from '../get-cache-file-path';

vi.mock('fs');
// The memfs volume holds no package.json, so find-cache-dir finds no cache directory. The fs mock
// reaches only transformed modules, not this CommonJS dependency, so its answer is mocked.
vi.mock('find-cache-dir', () => ({ default: () => undefined }));

describe('getCacheFilePath', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should return correct path', () => {
    const cacheFilePath: string = getCacheFilePath('test');

    expect(cacheFilePath).toBe('.cache/098f6bcd4621d373cade4e832627b4f6.json');
  });
});
