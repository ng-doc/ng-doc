import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ts } from 'ts-morph';
import { afterEach, expect, test } from 'vitest';

import type { DiscoverySnapshot } from '../../contracts';
import { inputsUnchanged, physicalInputs } from '../../session/input-verification';
import { OwnedRoots } from '../owned-roots';
import {
  tsconfigMembershipDependencies,
  tsconfigSpecs,
  UNVERIFIABLE_MEMBERSHIP,
} from '../program-inputs';
import { createSemanticService } from '../semantic-service';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

type Files = Record<string, string>;

function workspace(files: Files, tsConfig: string = 'tsconfig.json') {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'semantic-inputs-')));
  directories.push(directory);
  const write = (path: string, text: string) => {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  Object.entries(files).forEach(([path, text]) => write(path, text));
  const owned = [join(directory, 'output'), join(directory, 'cache')];
  const discovery: DiscoverySnapshot = {
    configuration: {
      projectId: 'site',
      workspaceRoot: directory,
      docsRoots: [directory],
      tsConfig: join(directory, tsConfig),
      outputRoot: owned[0]!,
      cacheRoot: owned[1]!,
      routePrefix: 'docs',
      guideDirectory: 'guides',
      apiDirectory: 'api',
      assetDirectory: 'assets',
      inlineStyleLanguage: 'SCSS',
      anchorHeadings: ['h2'],
      themes: { light: 'github-light', dark: 'github-dark' },
      cacheEnabled: true,
      digest: 'config',
      executables: [],
    },
    entries: [],
    globalKeywords: [],
    remoteKeywords: [],
  };
  /** Synchronizes, applies a mutation, then re-observes what the synchronization recorded. */
  const unchangedAfter = async (mutate: () => void = () => {}): Promise<boolean> => {
    const service = createSemanticService();
    try {
      const result = await service.synchronize(
        { generation: 1, discovery, changes: [] },
        new AbortController().signal,
      );
      expect(result.diagnostics).toEqual([]);
      mutate();
      return await inputsUnchanged(physicalInputs(result.dependencies), owned);
    } finally {
      await service.dispose();
    }
  };
  return { directory, write, unchangedAfter };
}

const options = { noLib: true, target: 'ES2022' };
const sources: Files = {
  'src/main.ts': "import { dep } from './lib/dep'; export const main = dep;",
  'src/lib/dep.ts': 'export const dep = 1;',
  'src/types.d.ts': 'declare const typed: 1;',
  'output/index.ts': 'export const generated = 1;',
};

test('include-style tsconfig: unchanged re-verifies, program membership and bytes are detected', async () => {
  const setup = () =>
    workspace({
      ...sources,
      'tsconfig.json': JSON.stringify({
        compilerOptions: options,
        include: ['src/**/*.ts', 'output/**/*.ts'],
      }),
    });
  expect(await setup().unchangedAfter()).toBe(true);
  const added = setup();
  expect(await added.unchangedAfter(() => added.write('src/lib/new.ts', 'export {};'))).toBe(false);
  const edited = setup();
  expect(
    await edited.unchangedAfter(() => edited.write('src/lib/dep.ts', 'export const dep = 2;')),
  ).toBe(false);
  // Neither a non-TypeScript file nor generator output is a program input.
  const unrelated = setup();
  expect(
    await unrelated.unchangedAfter(() => {
      unrelated.write('src/notes.md', '# notes');
      unrelated.write('output/extra.ts', 'export {};');
    }),
  ).toBe(true);
});

test('extends-style tsconfig: inherited include and exclude are rebased and re-verify', async () => {
  const setup = () =>
    workspace({
      ...sources,
      'config/tsconfig.base.json': JSON.stringify({
        compilerOptions: options,
        include: ['../src/**/*.ts'],
        exclude: ['../src/skip'],
      }),
      'tsconfig.json': JSON.stringify({ extends: './config/tsconfig.base.json' }),
    });
  expect(await setup().unchangedAfter()).toBe(true);
  const added = setup();
  expect(await added.unchangedAfter(() => added.write('src/added.ts', 'export {};'))).toBe(false);
  const excluded = setup();
  expect(await excluded.unchangedAfter(() => excluded.write('src/skip/x.ts', 'export {};'))).toBe(
    true,
  );
  const base = setup();
  expect(
    await base.unchangedAfter(() =>
      base.write(
        'config/tsconfig.base.json',
        JSON.stringify({ compilerOptions: options, include: ['../src/lib/**/*.ts'] }),
      ),
    ),
  ).toBe(false);
});

test('files-only tsconfig re-verifies and detects files entries and program bytes', async () => {
  const config = (files: string[]) => JSON.stringify({ compilerOptions: options, files });
  const setup = () => workspace({ ...sources, 'tsconfig.json': config(['src/main.ts']) });
  expect(await setup().unchangedAfter()).toBe(true);
  // Unselected files are not inputs.
  const unrelated = setup();
  expect(await unrelated.unchangedAfter(() => unrelated.write('src/other.ts', 'export {};'))).toBe(
    true,
  );
  const imported = setup();
  expect(
    await imported.unchangedAfter(() => imported.write('src/lib/dep.ts', 'export const dep = 3;')),
  ).toBe(false);
  const added = setup();
  expect(
    await added.unchangedAfter(() =>
      added.write('tsconfig.json', config(['src/main.ts', 'src/types.d.ts'])),
    ),
  ).toBe(false);
  const removed = workspace({
    ...sources,
    'tsconfig.json': config(['src/main.ts', 'src/types.d.ts']),
  });
  expect(
    await removed.unchangedAfter(() => removed.write('tsconfig.json', config(['src/main.ts']))),
  ).toBe(false);
  const deleted = workspace({
    ...sources,
    'tsconfig.json': config(['src/main.ts', 'src/types.d.ts']),
  });
  expect(
    await deleted.unchangedAfter(() => rmSync(join(deleted.directory, 'src/types.d.ts'))),
  ).toBe(false);
});

test('mixed files and include tsconfig (Angular CLI default) re-verifies', async () => {
  const setup = () =>
    workspace(
      {
        ...sources,
        'tsconfig.json': JSON.stringify({ compilerOptions: options }),
        'tsconfig.app.json': JSON.stringify({
          extends: './tsconfig.json',
          files: ['src/main.ts'],
          include: ['src/**/*.d.ts'],
        }),
      },
      'tsconfig.app.json',
    );
  expect(await setup().unchangedAfter()).toBe(true);
  const declaration = setup();
  expect(
    await declaration.unchangedAfter(() =>
      declaration.write('src/extra.d.ts', 'declare const x: 1;'),
    ),
  ).toBe(false);
  const unrelated = setup();
  expect(await unrelated.unchangedAfter(() => unrelated.write('src/extra.ts', 'export {};'))).toBe(
    true,
  );
  const main = setup();
  expect(await main.unchangedAfter(() => main.write('src/main.ts', 'export const main = 2;'))).toBe(
    false,
  );
});

test('directory, default, file and wildcard-directory include forms over-approximate TypeScript', async () => {
  const directoryForm = workspace({
    ...sources,
    'tsconfig.json': JSON.stringify({ compilerOptions: options, include: ['src'] }),
  });
  expect(await directoryForm.unchangedAfter(() => directoryForm.write('src/readme.md', '#'))).toBe(
    true,
  );
  const directoryAdded = workspace({
    ...sources,
    'tsconfig.json': JSON.stringify({ compilerOptions: options, include: ['src'] }),
  });
  expect(
    await directoryAdded.unchangedAfter(() =>
      directoryAdded.write('src/deep/new.ts', 'export {};'),
    ),
  ).toBe(false);

  const defaults = () =>
    workspace({
      ...sources,
      'tsconfig.json': JSON.stringify({
        compilerOptions: { ...options, allowJs: true, outDir: 'dist' },
      }),
    });
  const packages = defaults();
  expect(
    await packages.unchangedAfter(() => {
      packages.write('node_modules/pkg/index.ts', 'export {};');
      packages.write('dist/out.js', 'export {};');
    }),
  ).toBe(true);
  const script = defaults();
  expect(await script.unchangedAfter(() => script.write('tool.js', 'export {};'))).toBe(false);

  const forms = () =>
    workspace({
      ...sources,
      'tsconfig.json': JSON.stringify({
        compilerOptions: options,
        include: ['src/types.d.ts', 'src/lib/*', 'src/**/*'],
        exclude: ['**/*.spec.ts', 'src/lib/generated/**', 'elsewhere'],
      }),
    });
  expect(await forms().unchangedAfter()).toBe(true);
  const spec = forms();
  expect(await spec.unchangedAfter(() => spec.write('src/a.spec.ts', 'export {};'))).toBe(true);
  const nested = forms();
  expect(
    await nested.unchangedAfter(() => nested.write('src/lib/generated/x.ts', 'export {};')),
  ).toBe(true);
  const lib = forms();
  expect(await lib.unchangedAfter(() => lib.write('src/lib/more.ts', 'export {};'))).toBe(false);
});

// ---- TypeScript spec semantics, backstop and property coverage ---------------------------------

/** Parses with the TypeScript the semantic service uses and records membership observations. */
async function recordMembership(directory: string, configFile: string = 'tsconfig.json') {
  const file = join(directory, configFile);
  const parse = () => {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      file,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: () => {},
      },
    )!;
    return parsed;
  };
  const parsed = parse();
  const owned = [join(directory, 'output'), join(directory, 'cache')];
  const recorded = await tsconfigMembershipDependencies(parsed, file, new OwnedRoots(owned));
  const roots = () => new Set(parse().fileNames.map((name) => name.replace(/\\/g, '/')));
  return {
    parsed,
    recorded,
    roots,
    unchanged: () => inputsUnchanged(physicalInputs(recorded), owned),
    closed: recorded.some(
      (item) => item.kind === 'existence' && item.path.endsWith(UNVERIFIABLE_MEMBERSHIP),
    ),
  };
}

function tree(files: Files): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'semantic-specs-')));
  directories.push(directory);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  return directory;
}

const config = (value: object) => JSON.stringify({ compilerOptions: options, ...value });

interface Layout {
  name: string;
  files: Files;
  configFile?: string;
  added: string[];
  caseInsensitiveOnly?: boolean;
}

test.each<Layout>([
  {
    name: '${configDir} in an extended base',
    files: {
      'base/tsconfig.base.json': JSON.stringify({ include: ['${configDir}/src/**/*'] }),
      'app/tsconfig.json': config({ extends: '../base/tsconfig.base.json' }),
      'app/src/main.ts': 'export {};',
    },
    configFile: 'app/tsconfig.json',
    added: ['app/src/new.ts'],
  },
  {
    name: '${configDir} in the leaf',
    files: { 'tsconfig.json': config({ include: ['${configDir}/src/**/*'] }), 'src/main.ts': '' },
    added: ['src/new.ts'],
  },
  {
    name: 'a brace exclude TypeScript reads literally',
    files: {
      'tsconfig.json': config({ include: ['src/**/*'], exclude: ['src/**/*.{spec,test}.ts'] }),
      'src/main.ts': '',
    },
    added: ['src/x.spec.ts', 'src/x.test.ts'],
  },
  {
    name: 'a bracket exclude',
    files: {
      'tsconfig.json': config({ include: ['src/**/*'], exclude: ['src/[ab]/**/*'] }),
      'src/main.ts': '',
    },
    added: ['src/a/x.ts'],
  },
  {
    name: 'extglob excludes',
    files: {
      'tsconfig.json': config({
        include: ['src/**/*'],
        exclude: ['src/!(keep)/**/*', 'src/@(x)/*'],
      }),
      'src/main.ts': '',
    },
    added: ['src/other/y.ts', 'src/x/y.ts'],
  },
  {
    name: 'a parenthesised route-group include',
    files: { 'tsconfig.json': config({ include: ['src/(group)/**/*'] }), 'src/(group)/a.ts': '' },
    added: ['src/(group)/b.ts'],
  },
  {
    name: 'an upper-case extension pattern on a case-insensitive file system',
    files: { 'tsconfig.json': config({ include: ['src/**/*.TS'] }), 'src/main.ts': '' },
    added: ['src/new.ts'],
    caseInsensitiveOnly: true,
  },
])(
  'layout: $name detects every new root file TypeScript adds',
  async ({ files, configFile, added, caseInsensitiveOnly }) => {
    if (caseInsensitiveOnly && ts.sys.useCaseSensitiveFileNames) return;
    const directory = tree(files);
    for (const file of added) {
      const record = await recordMembership(directory, configFile);
      expect(record.closed).toBe(false);
      expect(await record.unchanged()).toBe(true);
      const before = record.roots();
      mkdirSync(join(directory, file, '..'), { recursive: true });
      writeFileSync(join(directory, file), 'export {};');
      // TypeScript really adds it as a root file, and verification must not reuse the result.
      expect(record.roots()).not.toEqual(before);
      expect(await record.unchanged()).toBe(false);
      rmSync(join(directory, file));
    }
  },
);

test('the backstop fails closed when recorded observations do not reproduce TypeScript roots', async () => {
  const directory = tree({
    'tsconfig.json': config({ include: ['${configDir}/src/**/*'] }),
    'src/main.ts': 'export {};',
  });
  const file = join(directory, 'tsconfig.json');
  const parsed = ts.getParsedCommandLineOfConfigFile(
    file,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    },
  )!;
  const owned = new OwnedRoots([join(directory, 'output')]);
  // A deliberately wrong translation (the pre-fix `${configDir}` reading) cannot verify.
  const wrong = await tsconfigMembershipDependencies(parsed, file, owned, {
    files: [],
    include: ['${configDir}/src/**/*'],
    exclude: [],
  });
  expect(wrong).toContainEqual({
    kind: 'existence',
    path: join(directory, UNVERIFIABLE_MEMBERSHIP),
    exists: true,
  });
  expect(await inputsUnchanged(physicalInputs(wrong), [])).toBe(false);
  // A scan failure also fails closed.
  const failed = await tsconfigMembershipDependencies(parsed, file, owned, {
    files: [],
    include: [join(directory, 'src/main.ts/**/*')],
    exclude: [],
  });
  expect(
    failed.some((item) => item.kind === 'existence' && item.path.endsWith(UNVERIFIABLE_MEMBERSHIP)),
  ).toBe(true);
  // TypeScript's own validated specs verify.
  const right = await tsconfigMembershipDependencies(parsed, file, owned);
  expect(
    right.some((item) => item.kind === 'existence' && item.path.endsWith(UNVERIFIABLE_MEMBERSHIP)),
  ).toBe(false);
  expect(await inputsUnchanged(physicalInputs(right), [])).toBe(true);
  // Without TypeScript's internal specs the raw configuration is substituted the same way.
  const { configFile: _configFile, ...withoutSpecs } = parsed.options as Record<string, unknown>;
  const fallback = tsconfigSpecs(
    { ...parsed, options: withoutSpecs } as ts.ParsedCommandLine,
    file,
  );
  expect(fallback).toEqual({ files: [], include: [`${directory}/src/**/*`], exclude: [] });
  expect(
    tsconfigSpecs(
      {
        ...parsed,
        options: withoutSpecs,
        raw: { files: ['${configDir}/a.ts', 1] },
      } as ts.ParsedCommandLine,
      file,
    ),
  ).toEqual({ files: [`${directory}/a.ts`], include: [], exclude: [] });
  expect(
    tsconfigSpecs(
      { ...parsed, options: withoutSpecs, raw: undefined } as ts.ParsedCommandLine,
      file,
    ),
  ).toEqual({
    files: [],
    include: ['**/*'],
    exclude: [],
  });
});

test('property: generated layouts never reuse a result after TypeScript gains a root file', async () => {
  let seed = 0x5eed;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
  const folders = [
    'src',
    'src/lib',
    'src/(group)',
    'src/[id]',
    'src/{x}',
    'src/@scope',
    'src/!bang',
    'src/Mixed',
    'src/.dot',
    'src/node_modules/pkg',
    'src/a b',
    'lib',
    'src/skip',
    'src/a',
  ];
  const names = [
    'main.ts',
    'x.spec.ts',
    'Upper.TS',
    'types.d.ts',
    'view.tsx',
    'tool.js',
    'notes.md',
    'data.json',
    'index.mts',
  ];
  const includes = [
    ['**/*'],
    ['src/**/*'],
    ['src/(group)/**/*'],
    ['${configDir}/src/**/*.ts'],
    ['src'],
    ['src/*/main.ts'],
    ['src/**/*.TS', 'lib'],
    ['src/@scope/*', 'src/{x}/*'],
    ['src/**/*.d.ts'],
  ];
  const excludes = [
    [],
    ['src/**/*.{spec,test}.ts'],
    ['src/[ab]/**/*'],
    ['**/*.spec.ts'],
    ['src/skip'],
    ['src/!(keep)/**/*'],
    ['${configDir}/src/lib'],
    ['src/*/node_modules'],
  ];
  let reused = 0;
  let closed = 0;
  let detected = 0;
  for (let layout = 0; layout < 40; layout++) {
    const files: Files = {
      'tsconfig.json': config({
        include: pick(includes),
        exclude: pick(excludes),
        ...(random() < 0.3 ? { files: ['src/main.ts'] } : {}),
        compilerOptions: { ...options, allowJs: random() < 0.3 },
      }),
      'src/main.ts': 'export {};',
    };
    for (let index = 0; index < 6; index++) files[`${pick(folders)}/${pick(names)}`] = 'export {};';
    const directory = tree(files);
    const record = await recordMembership(directory);
    if (record.closed) {
      closed++;
      expect(await record.unchanged()).toBe(false);
      continue;
    }
    expect(await record.unchanged()).toBe(true);
    reused++;
    for (let candidate = 0; candidate < 6; candidate++) {
      const path = `${pick(folders)}/new-${candidate}-${pick(names)}`;
      if (files[path]) continue;
      const before = record.roots();
      mkdirSync(join(directory, path, '..'), { recursive: true });
      writeFileSync(join(directory, path), 'export {};');
      const after = record.roots();
      if ([...after].some((name) => !before.has(name))) {
        detected++;
        expect(
          await record.unchanged(),
          `${JSON.stringify(files['tsconfig.json'])} + ${path}`,
        ).toBe(false);
      }
      rmSync(join(directory, path));
    }
  }
  expect(reused + closed).toBe(40);
  expect(detected).toBeGreaterThan(10);
});

// ---- Escapes that survive recording, and TypeScript's case folding -----------------------------

const SPECIAL = ['(', ')', '[', ']', '{', '}', '!', '+', '@', '|'];

test.each([
  ...SPECIAL.map((character) => ({
    name: `"${character}" after a wildcard`,
    include: `src/*/n${character}m/*.ts`,
    added: `src/a/n${character}m/f.ts`,
  })),
  {
    name: 'a route group below **',
    include: 'src/app/**/(auth)/*.ts',
    added: 'src/app/x/(auth)/login.ts',
  },
  { name: 'a dynamic segment', include: 'src/*/[id].ts', added: 'src/users/[id].ts' },
  { name: 'braces and brackets together', include: 'src/**/{a}[b]*.ts', added: 'src/q/{a}[b]c.ts' },
])(
  '$name with no initial match detects the first matching root file',
  async ({ include, added }) => {
    const directory = tree({
      'tsconfig.json': config({ files: ['src/main.ts'], include: [include] }),
      'src/main.ts': 'export {};',
    });
    const record = await recordMembership(directory);
    // Nothing matches yet, so only the recorded pattern itself can reveal the new file.
    expect(record.closed).toBe(false);
    expect(await record.unchanged()).toBe(true);
    const glob = record.recorded.find((item) => item.kind === 'glob');
    expect(glob?.kind === 'glob' && glob.include.join()).not.toContain('\\');
    const before = record.roots();
    mkdirSync(join(directory, added, '..'), { recursive: true });
    writeFileSync(join(directory, added), 'export {};');
    expect([...record.roots()].some((name) => !before.has(name))).toBe(true);
    expect(await record.unchanged()).toBe(false);
  },
);

test.each([
  ['σ', 'ς'],
  ['σ', 'Σ'],
  ['Σ', 'ς'],
  ['ς', 'σ'],
  ['é', 'É'],
  ['д', 'Д'],
  ['ß', 'ẞ'],
  ['ẞ', 'ß'],
  ['ı', 'I'],
  ['i', 'İ'],
  ['İ', 'i'],
  ['s', '\u017F'],
  ['k', '\u212A'],
  ['k', 'K'],
])(
  'pattern letter %s against a new file starting with %s follows TypeScript case folding',
  async (pattern, file) => {
    const directory = tree({
      'tsconfig.json': config({ files: ['src/main.ts'], include: [`src/*/${pattern}*.ts`] }),
      'src/main.ts': 'export {};',
    });
    const record = await recordMembership(directory);
    expect(record.closed).toBe(false);
    const before = record.roots();
    mkdirSync(join(directory, 'src/q'), { recursive: true });
    writeFileSync(join(directory, `src/q/${file}x.ts`), 'export {};');
    const added = [...record.roots()].some((name) => !before.has(name));
    // TypeScript's non-Unicode `/i` decides; verification must see every file TypeScript adds.
    // Documented outcomes on a case-insensitive file system: σ, ς and Σ fold together (as do
    // é/É, д/Д and k/K); ß and ẞ, ı and I, i and İ, s and ſ (U+017F), and k and the Kelvin
    // sign (U+212A) do not.
    if (added) expect(await record.unchanged()).toBe(false);
    expect(added).toBe(
      !ts.sys.useCaseSensitiveFileNames &&
        ['σς', 'σΣ', 'Σς', 'ςσ', 'éÉ', 'дД', 'kK'].includes(`${pattern}${file}`),
    );
  },
);
