import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compareText } from '../../helpers/text-order';

// Generated output must not depend on the process locale. `localeCompare` without a locale follows
// `LANG`/`LC_ALL`, so API members, keywords, navigation, discovery entries and the output manifest
// used to be ordered differently on a Swedish machine (`Ä` after `Z`) than on an English one or a
// CI runner (C or POSIX, which V8 maps to `en-US`). Every order that reaches output goes through
// the one fixed collator (`helpers/text-order.ts`), so the same tree compiles to the same bytes
// in every locale. The process locale is read once at start-up, so each locale needs its own
// process: the test bundles a driver from source and runs it once per locale.

const repository = path.resolve(import.meta.dirname, '../../../..');
const run = promisify(execFile);

/** Names that Swedish orders differently from English: `Ä` and `Ö` sort after `Z` there. */
const files: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
    include: ['docs/**/*.ts'],
  }),
  'ng-doc.config.ts': `export default { docsPath: 'docs', cache: false };`,
  'docs/ng-doc.api.ts': `const api = { title: 'API', keyword: 'ApiIndex', scopes: [{ name: 'Public', route: 'public', include: ['docs/api/*.ts'] }] }; export default api;`,
  'docs/api/order.ts': [
    '/** Ärende declaration. */',
    'export class Ärende {',
    '  /** Zeta value. */ zeta = 1;',
    '  /** Ärlig value. */ ärlig = 2;',
    '  /** Alpha value. */ alpha = 3;',
    '  /** Öst value. */ öst = 4;',
    '  /** Returns zeta. */ zetaMethod(): number { return this.zeta; }',
    '  /** Returns ärlig. */ ärligMethod(): number { return this.ärlig; }',
    '}',
    '/** Zeta declaration. */',
    'export interface Zeta { /** Z. */ zebra: string; /** Ä. */ ärm: string; /** A. */ apple: string; }',
    '/** Alpha declaration. */',
    'export function alpha(): void {}',
    '/** Öst constant. */',
    'export const Öst = 1;',
    '',
  ].join('\n'),
  'docs/zeta/ng-doc.page.ts': `const page = { title: 'Zeta', route: 'zeta', mdFile: './index.md' }; export default page;`,
  'docs/zeta/index.md':
    '---\nkeyword: ZetaPage\n---\n# Zeta\n\nSee `Ärende`, `Zeta`, `alpha` and `Öst`.\n',
  'docs/ärlig/ng-doc.page.ts': `const page = { title: 'Ärlig', route: 'ärlig', mdFile: './index.md' }; export default page;`,
  'docs/ärlig/index.md':
    '---\nkeyword: ÄrligPage\n---\n# Ärlig\n\n## Ärende section\n\nSee `*ZetaPage` and `*alphaPage`.\n',
  'docs/alpha/ng-doc.page.ts': `const page = { title: 'alpha', route: 'alpha', mdFile: './index.md' }; export default page;`,
  'docs/alpha/index.md': '---\nkeyword: alphaPage\n---\n# alpha\n\nSee `*ÄrligPage`.\n',
};

/** Compiles the fixture in production, commits it and prints the result. */
const driver = `
import { createOutputCommitter } from '../artifacts';
import { createCompilationService } from './index';

const options = JSON.parse(process.argv[2]);
const service = createCompilationService(options);
const result = await service.compile(
  { generation: 1, mode: 'production', changes: [] },
  new AbortController().signal,
);
let commit;
if (result.candidate) {
  const committer = createOutputCommitter({ outputRoot: options.defaults.outputRoot });
  commit = await committer.commit(
    { generation: 1, candidate: result.candidate },
    { isCurrent: () => true },
    new AbortController().signal,
  );
  await committer.dispose();
}
await service.dispose();
process.stdout.write(
  JSON.stringify({
    locale: new Intl.Collator().resolvedOptions().locale,
    unsorted: ['Zeta', 'Ärlig', 'alpha'].sort((left, right) => left.localeCompare(right)),
    diagnostics: result.diagnostics,
    candidate: result.candidate,
    commit,
  }),
);
`;

let bundle: string;
let root: string;

beforeAll(async () => {
  bundle = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-locale-driver-')));
  symlinkSync(path.join(repository, 'node_modules'), path.join(bundle, 'node_modules'), 'dir');
  await build({
    absWorkingDir: repository,
    stdin: {
      contents: driver,
      resolveDir: import.meta.dirname,
      sourcefile: 'locale-driver.ts',
      loader: 'ts',
    },
    outfile: path.join(bundle, 'driver.mjs'),
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
    alias: {
      '@ng-doc/core': path.join(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(repository, 'libs/utils/index.ts'),
    },
  });
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-locale-')));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}, 120_000);

afterAll(() => {
  for (const directory of [root, bundle])
    if (directory) rmSync(directory, { recursive: true, force: true });
});

/** Every file under a directory, by relative path in code-unit order, with its bytes. */
function tree(directory: string): Array<[string, string]> {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      return [path.relative(directory, file), readFileSync(file).toString('base64')] as [
        string,
        string,
      ];
    })
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

/** Compiles and commits the fixture in a process whose locale is `locale`, from a clean tree. */
async function generate(locale: string) {
  const outputRoot = path.join(root, 'out');
  rmSync(outputRoot, { recursive: true, force: true });
  rmSync(path.join(root, 'cache'), { recursive: true, force: true });
  const options = {
    projectId: 'locale',
    workspaceRoot: root,
    configFile: path.join(root, 'ng-doc.config.ts'),
    defaults: {
      docsRoot: path.join(root, 'docs'),
      tsConfig: path.join(root, 'tsconfig.json'),
      outputRoot,
      cacheRoot: path.join(root, 'cache'),
    },
    templateRoot: path.join(repository, 'libs/builder/templates'),
    compilerVersion: 'test-v1',
    toolchainDigest: 'real-ts6-shiki',
  };
  const env: NodeJS.ProcessEnv = { ...process.env, LANG: locale, LC_ALL: locale };
  delete env.LANGUAGE;
  const { stdout } = await run(
    process.execPath,
    [path.join(bundle, 'driver.mjs'), JSON.stringify(options)],
    { cwd: root, env, maxBuffer: 256 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout);
  return { result, output: stdout, files: tree(outputRoot) };
}

// Windows takes the locale from the user's settings, not from `LANG`.
describe.skipIf(process.platform === 'win32')('generation in different process locales', () => {
  it('is byte-identical in Swedish and in the C locale', async () => {
    const swedish = await generate('sv_SE.UTF-8');
    const c = await generate('C.UTF-8');

    // The two processes really order text differently.
    expect(swedish.result.locale).toBe('sv-SE');
    expect(swedish.result.unsorted).toEqual(['alpha', 'Zeta', 'Ärlig']);
    expect(c.result.unsorted).toEqual(['alpha', 'Ärlig', 'Zeta']);

    const errors = (result: { diagnostics: Array<{ severity: string }> }) =>
      result.diagnostics.filter((item) => item.severity === 'error');
    expect(errors(swedish.result)).toEqual([]);
    expect(swedish.result.commit?.status).toBe('committed');

    // The same bytes: every committed file (the manifest included), the snapshot, the commit and
    // the diagnostics.
    expect(c.files.map(([file]) => file)).toEqual(swedish.files.map(([file]) => file));
    for (const [index, [file, bytes]] of c.files.entries())
      expect({ file, bytes }).toEqual({ file, bytes: swedish.files[index][1] });
    expect(JSON.stringify({ ...c.result, locale: undefined, unsorted: undefined })).toBe(
      JSON.stringify({ ...swedish.result, locale: undefined, unsorted: undefined }),
    );

    // The fixture reaches the orders that used to follow the locale, and they are English, the
    // shared collator's order.
    expect(['Zeta', 'Ärlig', 'alpha'].sort(compareText)).toEqual(c.result.unsorted);
    expect(swedish.files.some(([file]) => file.includes('ärlig'))).toBe(true);
    const api = swedish.files
      .filter(([file]) => file.includes('rende'))
      .map(([, bytes]) => Buffer.from(bytes, 'base64').toString('utf8'))
      .join('\n');
    expect(api.indexOf('alpha')).toBeGreaterThan(-1);
    expect(api.indexOf('alpha')).toBeLessThan(api.indexOf('ärlig'));
    expect(api.indexOf('ärlig')).toBeLessThan(api.indexOf('zeta'));
  }, 240_000);
});

describe('the shipped builder sources', () => {
  it('order nothing with the process locale', () => {
    // `localeCompare` without a locale follows the process; with one, the shared collator says
    // which. A test, a harness or a script outside the package may still use it.
    const builder = path.join(repository, 'libs/builder');
    const shipped = readdirSync(builder, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(ts|nunj)$/.test(entry.name))
      .map((entry) => path.relative(builder, path.join(entry.parentPath, entry.name)))
      .map((file) => file.split(path.sep).join('/'))
      .filter(
        (file) =>
          !/(^|\/)(testing|acceptance|node_modules)\//.test(file) &&
          !/\.(spec|vitest|integration)\.ts$/.test(file),
      );
    expect(shipped.length).toBeGreaterThan(100);
    expect(
      shipped.filter((file) =>
        /\.localeCompare\(/.test(readFileSync(path.join(builder, file), 'utf8')),
      ),
    ).toEqual([]);
  });
});
