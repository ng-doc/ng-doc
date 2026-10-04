import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCacheDirPath } from '../get-cache-dir-path';

vi.mock('fs');
// The memfs volume holds no package.json, so find-cache-dir finds no cache directory. The fs mock
// reaches only transformed modules, not this CommonJS dependency, so its answer is mocked.
vi.mock('find-cache-dir', () => ({ default: () => undefined }));

describe('getCacheDirPath', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should return correct path', () => {
    const cacheFilePath: string = getCacheDirPath();

    expect(cacheFilePath).toBe('.cache');
  });
});
