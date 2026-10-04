import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCache } from '../load-cache';

vi.mock('fs');
// The memfs volume holds no package.json, so find-cache-dir finds no cache directory. The fs mock
// reaches only transformed modules, not this CommonJS dependency, so its answer is mocked.
vi.mock('find-cache-dir', () => ({ default: () => undefined }));

describe('loadCache', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should load cache', () => {
    vol.fromJSON({
      '.cache/098f6bcd4621d373cade4e832627b4f6.json': JSON.stringify({ version: '0.0.0' }),
    });

    expect(loadCache('test')).toEqual({ version: '0.0.0' });
  });
});
