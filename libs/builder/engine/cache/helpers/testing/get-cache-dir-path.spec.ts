import { vol } from 'memfs';

import { getCacheDirPath } from '../get-cache-dir-path';

jest.mock('fs');

describe('getCacheDirPath', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should return correct path', () => {
    const cacheFilePath: string = getCacheDirPath();

    expect(cacheFilePath).toBe('.cache');
  });
});
