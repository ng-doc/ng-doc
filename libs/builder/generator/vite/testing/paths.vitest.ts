import { describe, expect, it } from 'vitest';

import { canonicalDrive } from '../paths';

describe('canonicalDrive', () => {
  it('upper-cases a Windows drive letter and leaves every other path alone', () => {
    expect(canonicalDrive('c:\\work\\docs')).toBe('C:\\work\\docs');
    expect(canonicalDrive('d:/work/docs')).toBe('D:/work/docs');
    expect(canonicalDrive('C:/work/docs')).toBe('C:/work/docs');
    expect(canonicalDrive('/home/user/c:/docs')).toBe('/home/user/c:/docs');
    expect(canonicalDrive('\\\\server\\share\\docs')).toBe('\\\\server\\share\\docs');
    expect(canonicalDrive('')).toBe('');
  });
});
