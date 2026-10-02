import path from 'node:path';
import { ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import { forwardSlashes, hostPath } from '../../kernel/paths';

describe('the engine spelling of host paths', () => {
  it('records a Windows path with forward slashes, its drive letter kept', () => {
    expect(hostPath('D:\\a\\_temp\\docs\\page.md', path.win32)).toBe('D:/a/_temp/docs/page.md');
    expect(hostPath('D:\\a\\docs\\..\\templates\\.\\page.ts.njk', path.win32)).toBe(
      'D:/a/templates/page.ts.njk',
    );
    expect(hostPath('D:/a/mixed\\style/page.md', path.win32)).toBe('D:/a/mixed/style/page.md');
    expect(hostPath('\\\\server\\share\\docs\\page.md', path.win32)).toBe(
      '//server/share/docs/page.md',
    );
    expect(hostPath('D:\\', path.win32)).toBe('D:/');
  });

  it('leaves a resolved POSIX path unchanged and resolves the rest', () => {
    expect(hostPath('/work/docs/page.md', path.posix)).toBe('/work/docs/page.md');
    expect(hostPath('/work/docs/../page.md', path.posix)).toBe('/work/page.md');
    expect(hostPath('/work/docs/page.md')).toBe(path.resolve('/work/docs/page.md'));
  });

  it('turns the separators of a relative path without resolving it', () => {
    expect(forwardSlashes('guides\\one\\page.ts')).toBe('guides/one/page.ts');
    expect(forwardSlashes('guides/one/page.ts')).toBe('guides/one/page.ts');
  });
});

describe('a TypeScript configuration named by a Windows path', () => {
  // The host a Windows run gives TypeScript, simulated: the file names are all TypeScript reads.
  const parse = (configFile: string, text: string) =>
    ts.getParsedCommandLineOfConfigFile(
      configFile,
      {},
      {
        useCaseSensitiveFileNames: false,
        getCurrentDirectory: () => 'D:/a/workspace',
        fileExists: () => true,
        readFile: () => text,
        readDirectory: () => ['D:/a/workspace/public.ts'],
        onUnRecoverableConfigFileDiagnostic: () => {},
      },
    );
  const native = 'D:\\a\\workspace\\tsconfig.json';

  it('reports a syntax error only in the engine spelling; a backslash path fails an assertion', () => {
    expect(() => parse(native, '{ broken')).toThrow(/Debug Failure/);
    const parsed = parse(hostPath(native, path.win32), '{ broken')!;
    expect(parsed.errors.map((error) => error.code)).toEqual([1136]);
    expect(parsed.fileNames).toEqual(['D:/a/workspace/public.ts']);
  });
});
