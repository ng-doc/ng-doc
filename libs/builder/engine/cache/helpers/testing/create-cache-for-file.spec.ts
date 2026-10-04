import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCacheForFile } from '../create-cache-for-file';

vi.mock('fs');

describe('createCacheForFile', () => {
  beforeEach(() => {
    vol.reset();

    vol.fromJSON({
      'folder/file1': 'content',
    });
  });

  it('should return a cache for a file', () => {
    const result: string = createCacheForFile('folder/file1');

    expect(result).toBeTruthy();
  });
});
