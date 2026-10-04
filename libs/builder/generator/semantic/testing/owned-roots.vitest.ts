import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename } from 'node:path';
import { type FileSystemHost, Project, ts } from 'ts-morph';
import { afterEach, expect, test } from 'vitest';

import type { ApiDescriptor, Dependency, DiscoverySnapshot } from '../../contracts';
import { missingFileError, OwnedRoots } from '../owned-roots';
import { createSemanticService } from '../semantic-service';
import { join } from './engine-paths';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function workspace(options: { generatedImport: boolean; include?: string[] }) {
  const directory = mkdtempSync(join(tmpdir(), 'semantic-owned-'));
  directories.push(directory);
  const write = (path: string, text: string) => {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        noLib: true,
        target: 'ES2022',
        strict: true,
        baseUrl: '.',
        paths: { '@ng-doc/generated': ['./output/index.ts'] },
      },
      // Applications commonly include their generated output as well as importing it.
      include: ['*.ts', 'output/**/*.ts'],
    }),
  );
  write('entry.ts', 'const Page = {}; export default Page;');
  write(
    'plain.ts',
    '/** Plain docs. */\nexport class Plain { /** Plain value. */ value = 1; read(input: string): string { return input; } }\n',
  );
  write(
    'public.ts',
    `${options.generatedImport ? "import { NG_DOC_ROUTING, type Generated } from '@ng-doc/generated';\n" : ''}` +
      '/** Base docs. */\nexport class Base { /** Base value. */ value = 1; }\n' +
      '/** User subclass. */\nexport class UserChild extends Base {}\n' +
      (options.generatedImport
        ? '/** Uses generated. */\nexport class UsesGenerated { /** Inferred. */ readonly inferred = NG_DOC_ROUTING; /** Annotated. */ annotated!: Generated; }\n'
        : ''),
  );
  if (options.generatedImport)
    write(
      'app.ts',
      "import { NG_DOC_ROUTING } from '@ng-doc/generated'; export const routes = NG_DOC_ROUTING;",
    );
  const discovery: DiscoverySnapshot = {
    configuration: {
      projectId: 'site',
      workspaceRoot: directory,
      docsRoots: [directory],
      tsConfig: join(directory, 'tsconfig.json'),
      outputRoot: join(directory, 'output'),
      cacheRoot: join(directory, 'cache'),
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
    entries: [
      {
        source: { path: join(directory, 'entry.ts') },
        title: 'Reference',
        route: 'api',
        absoluteRoute: 'docs/api',
        breadcrumbs: ['Reference'],
        runtimeImport: { source: join(directory, 'entry.ts'), exportName: 'default' },
        dependencies: [],
        id: 'api',
        kind: 'api',
        scopes: [
          {
            id: 'public',
            name: 'Public',
            route: 'public',
            include: options.include ?? ['public.ts', 'plain.ts'],
            exclude: [],
          },
        ],
      } as ApiDescriptor,
    ],
    globalKeywords: [],
    remoteKeywords: [],
  };
  /** Generator output: a page class extending the public API, the imported type and value. */
  const commit = () => {
    write(
      'output/index.ts',
      "import { Base } from '../public';\nexport class PageComponent extends Base {}\nexport interface Generated { real: string }\nexport const NG_DOC_ROUTING: string[] = [];\n",
    );
    write('cache/index.ts', 'export const cached = 1;');
  };
  return { directory, discovery, commit };
}

async function synchronize(discovery: DiscoverySnapshot) {
  const service = createSemanticService();
  const synced = await service.synchronize(
    { generation: 1, discovery, changes: [] },
    new AbortController().signal,
  );
  const declarations = service.enumerateApi('api').value ?? [];
  const render = (name: string) =>
    service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarations.find((item) => item.name === name)!.id,
    }).value?.value as string;
  const pages = Object.fromEntries(declarations.map((item) => [item.name, render(item.name)]));
  await service.dispose();
  return { synced, names: declarations.map((item) => item.name).sort(), pages };
}

const semanticDigest = (dependencies: Dependency[]) =>
  dependencies.find((item) => item.kind === 'semantic')?.digest;
const paths = (dependencies: Dependency[]) =>
  dependencies.flatMap((item) =>
    item.kind === 'content' || item.kind === 'existence'
      ? [item.path]
      : item.kind === 'glob'
        ? item.members
        : item.kind === 'semantic'
          ? item.files
          : [],
  );
const typeCell = (page: string, member: string) =>
  page
    .replace(/\s+/g, ' ')
    // The symbol view: the member row's signature holds the type.
    .match(
      new RegExp(`dataSlug="${member}".*?ng-doc-member-signature">.*?<code[^>]*>([^<]*)<`),
    )?.[1];

test('generator output never enters the semantic program, so a commit cannot change its scope', async () => {
  const { directory, discovery, commit } = workspace({ generatedImport: true });
  const cold = await synchronize(discovery);
  expect(cold.synced.diagnostics).toEqual([]);
  commit();
  const warm = await synchronize(discovery);
  expect(warm.synced.diagnostics).toEqual([]);

  // The committed output is invisible: identical digest, no owned path recorded or resolved.
  expect(semanticDigest(warm.synced.dependencies)).toBe(semanticDigest(cold.synced.dependencies));
  expect(warm.synced.dependencies).toEqual(cold.synced.dependencies);
  const owned = [join(directory, 'output'), join(directory, 'cache')];
  expect(
    paths(warm.synced.dependencies).filter((file) =>
      owned.some((root) => file === root || file.startsWith(`${root}/`)),
    ),
  ).toEqual([]);

  // Extended by lists user subclasses and never the generator's own page classes.
  expect(warm.pages).toEqual(cold.pages);
  expect(warm.pages['Base']).toMatch(/Extended by[\s\S]*<code>UserChild<\/code>/);
  expect(warm.pages['Base']).not.toContain('PageComponent');
  // A type imported from @ng-doc/generated is unresolved in every build: an annotation renders
  // its written text, an inferred type renders `any`.
  expect(typeCell(warm.pages['UsesGenerated']!, 'annotated')).toBe('Generated');
  expect(typeCell(warm.pages['UsesGenerated']!, 'inferred')).toBe('any');
});

test('a declaration unrelated to generated output renders byte-identically to a workspace without it', async () => {
  const importing = workspace({ generatedImport: true });
  importing.commit();
  const plain = workspace({ generatedImport: false });
  const [withOutput, without] = await Promise.all([
    synchronize(importing.discovery),
    synchronize(plain.discovery),
  ]);
  expect(withOutput.pages['Plain']).toBeTruthy();
  expect(withOutput.pages['Plain']).toBe(without.pages['Plain']);
  expect(withOutput.pages['Base']).toBe(without.pages['Base']);
});

test('owned roots overlapping documented sources fail with a clear diagnostic', async () => {
  const synchronizeWith = async (
    outputRoot: (directory: string) => string,
    include = ['src/**/*.ts'],
    exclude: string[] = [],
  ) => {
    const { directory, discovery } = workspace({ generatedImport: false, include });
    (discovery.entries[0] as ApiDescriptor).scopes[0]!.exclude = exclude;
    mkdirSync(join(directory, 'src/lib'), { recursive: true });
    writeFileSync(join(directory, 'src/public.ts'), 'export class Documented {}');
    writeFileSync(join(directory, 'src/lib/documented.ts'), 'export class Nested {}');
    discovery.configuration.outputRoot = outputRoot(directory);
    const service = createSemanticService();
    try {
      return (
        await service.synchronize(
          { generation: 1, discovery, changes: [] },
          new AbortController().signal,
        )
      ).diagnostics;
    } finally {
      await service.dispose();
    }
  };
  const overlap = (subject: RegExp) => [
    expect.objectContaining({
      code: 'SEMANTIC_OWNED_ROOT_OVERLAP',
      severity: 'error',
      message: expect.stringMatching(subject),
    }),
  ];
  // outputRoot = src and src/lib: the scope pattern reaches the owned root.
  expect(await synchronizeWith((root) => join(root, 'src'))).toEqual(
    overlap(
      /^API scope "Public" include pattern "src\/\*\*\/\*\.ts" can match files under the generator-owned root .*\/src\. Narrow the pattern or add "src\/\*\*"/,
    ),
  );
  expect(await synchronizeWith((root) => join(root, 'src/lib'))).toEqual(
    overlap(/^API scope "Public" include pattern .* root .*\/src\/lib\. .*"src\/lib\/\*\*"/),
  );
  // Broad scopes reaching a not-yet-generated output root fail on the first (cold) build.
  expect(await synchronizeWith((root) => join(root, 'src/generated'))).toEqual(
    overlap(
      /include pattern "src\/\*\*\/\*\.ts" can match files under the generator-owned root .*\/src\/generated\./,
    ),
  );
  expect(await synchronizeWith((root) => join(root, '.ng-doc/x'), ['**/*.ts'])).toEqual(
    overlap(
      /include pattern "\*\*\/\*\.ts" can match files under the generator-owned root .*\/\.ng-doc\/x\./,
    ),
  );
  expect(
    await synchronizeWith(
      (root) => join(root, 'src/generated'),
      ['src/**/*.ts'],
      ['src/generated/**'],
    ),
  ).toEqual([]);
  expect(await synchronizeWith((root) => join(root, 'src/generated'), ['src/lib/*.ts'])).toEqual(
    [],
  );
  // The generator writes module scripts only in page directories, never at the output root.
  const moduleScopes = (include: string) => ['src/lib/*.ts', include];
  expect(
    await synchronizeWith(
      (root) => join(root, 'src/generated'),
      moduleScopes('src/generated/*.{mjs,d.mts}'),
    ),
  ).toEqual([]);
  expect(
    await synchronizeWith(
      (root) => join(root, 'src/generated'),
      moduleScopes('src/generated/**/*.mjs'),
    ),
  ).toEqual(
    overlap(
      /include pattern "src\/generated\/\*\*\/\*\.mjs" can match files under the generator-owned root/,
    ),
  );
  // An exclude covering every generated shape (but not other files) passes the pattern check;
  // an existing non-generated file under the owned root is still rejected by the match check.
  const generatedShapes = [
    'src/lib/**/*.ts',
    'src/lib/**/*.mts',
    'src/lib/**/*.mjs',
    'src/lib/**/*.json',
  ];
  expect(
    await synchronizeWith((root) => join(root, 'src/lib'), ['src/**/*'], generatedShapes),
  ).toEqual([]);
  expect(
    await synchronizeWith(
      (root) => {
        writeFileSync(join(root, 'src/lib/view.tsx'), 'export {};');
        return join(root, 'src/lib');
      },
      ['src/**/*'],
      generatedShapes,
    ),
  ).toEqual(
    overlap(/^API scope "Public" match .*src\/lib\/view\.tsx lies under a generator-owned/),
  );
  // No false errors for scopes that cannot match generated shapes, for a bare directory
  // exclude the scan honours, and for TypeScript scopes against a JSON-only cache root.
  expect(
    await synchronizeWith(
      (root) => join(root, 'src/generated'),
      ['**/public-api.ts', '**/src/lib/*.ts'],
    ),
  ).toEqual([]);
  expect(
    await synchronizeWith(
      (root) => join(root, 'src/generated'),
      ['src/**/*.ts'],
      ['src/generated'],
    ),
  ).toEqual([]);
  expect(
    await synchronizeWith((root) => join(root, 'src/generated'), ['src/**/*.ts'], ['**/generated']),
  ).toEqual([]);
  const cacheOnly = async (include: string[]) => {
    const { directory, discovery } = workspace({ generatedImport: false, include });
    discovery.configuration.outputRoot = join(directory, 'ng-doc/app');
    discovery.configuration.cacheRoot = join(directory, 'src/.cache/ng-doc');
    mkdirSync(join(directory, 'src'), { recursive: true });
    writeFileSync(join(directory, 'src/public.ts'), 'export class Documented {}');
    const service = createSemanticService();
    try {
      return (
        await service.synchronize(
          { generation: 1, discovery, changes: [] },
          new AbortController().signal,
        )
      ).diagnostics;
    } finally {
      await service.dispose();
    }
  };
  expect(await cacheOnly(['src/**/*.ts'])).toEqual([]);
  expect(await cacheOnly(['src/**/*.json'])).toEqual(
    overlap(
      /include pattern "src\/\*\*\/\*\.json" can match files under the generator-owned root .*\/src\/\.cache\/ng-doc\./,
    ),
  );
  // outputRoot = workspace root: the TypeScript configuration itself is owned.
  expect(await synchronizeWith((root) => root)).toEqual(
    overlap(/^TypeScript configuration .*tsconfig\.json lies under a generator-owned/),
  );
  // A documentation entry and a declaration path under an owned root.
  const { directory, discovery } = workspace({ generatedImport: false, include: ['plain.ts'] });
  discovery.configuration.tsConfig = join(directory, 'config/tsconfig.json');
  mkdirSync(join(directory, 'config'));
  writeFileSync(discovery.configuration.tsConfig, JSON.stringify({ files: ['../plain.ts'] }));
  discovery.configuration.outputRoot = directory;
  discovery.configuration.cacheRoot = join(directory, 'cache');
  const service = createSemanticService();
  try {
    discovery.configuration.outputRoot = join(directory, 'entry.ts');
    const entry = await service.synchronize(
      { generation: 1, discovery, changes: [] },
      new AbortController().signal,
    );
    expect(entry.diagnostics).toEqual(overlap(/^Documentation entry .*entry\.ts lies under/));
    discovery.configuration.outputRoot = join(directory, 'output');
    expect(
      (
        await service.synchronize(
          { generation: 2, discovery, changes: [] },
          new AbortController().signal,
        )
      ).diagnostics,
    ).toEqual([]);
    mkdirSync(join(directory, 'output'), { recursive: true });
    writeFileSync(join(directory, 'output/index.ts'), 'export class PageComponent {}');
    const owned = service.renderFragment({
      kind: 'api',
      entryId: 'api',
      declarationPath: './output/index.ts#PageComponent',
    });
    expect(owned.value).toBeUndefined();
    expect(owned.diagnostics).toEqual(
      overlap(/^API declaration path .*output\/index\.ts lies under/),
    );
  } finally {
    await service.dispose();
  }
});

test('the owned file system hides owned paths and otherwise delegates to the real host', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'semantic-owned-fs-'));
  directories.push(directory);
  const outside = join(directory, 'outside');
  const output = join(directory, 'output');
  mkdirSync(join(output, 'nested'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(output, 'index.ts'), 'export const hidden = 1;');
  writeFileSync(join(outside, 'index.ts'), 'export const visible = 1;');
  const roots = new OwnedRoots([output, '', output]);
  expect(roots.has(output)).toBe(true);
  expect(roots.has(join(output, 'nested/file.ts'))).toBe(true);
  expect(roots.has(`${output}-sibling/file.ts`)).toBe(false);
  const system = roots.fileSystem();

  expect(system.isCaseSensitive()).toBe(roots.fileSystem().isCaseSensitive());
  expect(system.getCurrentDirectory()).toBe(process.cwd().replace(/\\/g, '/'));
  expect(system.fileExistsSync(join(output, 'index.ts'))).toBe(false);
  expect(await system.fileExists(join(output, 'index.ts'))).toBe(false);
  expect(system.fileExistsSync(join(outside, 'index.ts'))).toBe(true);
  expect(await system.fileExists(join(outside, 'index.ts'))).toBe(true);
  expect(system.directoryExistsSync(output)).toBe(false);
  expect(await system.directoryExists(output)).toBe(false);
  expect(system.directoryExistsSync(outside)).toBe(true);
  expect(await system.directoryExists(outside)).toBe(true);
  expect(system.readDirSync(directory).map((entry) => basename(entry.name))).toEqual(['outside']);
  expect(system.readDirSync(output)).toEqual([]);
  expect(system.globSync([`${directory}/**/*.ts`])).toEqual([join(outside, 'index.ts')]);
  expect(await system.glob([`${directory}/**/*.ts`])).toEqual([join(outside, 'index.ts')]);
  expect(system.readFileSync(join(outside, 'index.ts'))).toContain('visible');
  expect(await system.readFile(join(outside, 'index.ts'))).toContain('visible');
  expect(system.realpathSync(join(outside, 'index.ts'))).toBe(
    roots.fileSystem().realpathSync(join(outside, 'index.ts')),
  );

  // Hidden files fail exactly like missing files on the real ts-morph host.
  const Missing = missingFileError(new Project().getFileSystem());
  expect(() => system.readFileSync(join(output, 'index.ts'))).toThrow(Missing);
  await expect(system.readFile(join(output, 'index.ts'))).rejects.toBeInstanceOf(Missing);
  const project = new Project({ fileSystem: system, compilerOptions: { noLib: true } });
  expect(project.addSourceFileAtPathIfExists(join(output, 'index.ts'))).toBeUndefined();
  expect(() => project.addSourceFileAtPath(join(output, 'index.ts'))).toThrow(Missing);
  expect(project.addSourceFileAtPathIfExists(join(outside, 'index.ts'))).toBeDefined();

  // Writes are not filtered; semantic never issues them.
  const copy = join(outside, 'copy.ts');
  system.writeFileSync(join(outside, 'written.ts'), 'a');
  await system.writeFile(join(outside, 'written-async.ts'), 'b');
  system.mkdirSync(join(outside, 'made'));
  await system.mkdir(join(outside, 'made-async'));
  system.copySync(join(outside, 'written.ts'), copy);
  await system.copy(copy, join(outside, 'copy-async.ts'));
  system.moveSync(copy, join(outside, 'moved.ts'));
  await system.move(join(outside, 'moved.ts'), join(outside, 'moved-async.ts'));
  expect(readFileSync(join(outside, 'moved-async.ts'), 'utf8')).toBe('a');
  system.deleteSync(join(outside, 'moved-async.ts'));
  await system.delete(join(outside, 'copy-async.ts'));
  expect(existsSync(join(outside, 'moved-async.ts'))).toBe(false);
  expect(existsSync(join(outside, 'copy-async.ts'))).toBe(false);
  expect(existsSync(join(outside, 'written-async.ts'))).toBe(true);
});

test('the owned resolution host hides owned probes and tolerates optional host members', () => {
  const output = join(tmpdir(), 'semantic-owned-host', 'output');
  const roots = new OwnedRoots([output]);
  const probes: string[] = [];
  const minimal: ts.ModuleResolutionHost = {
    fileExists: (file) => {
      probes.push(file);
      return true;
    },
    readFile: (file) => `read:${file}`,
  };
  const host = roots.resolutionHost(minimal);
  expect(host.fileExists(join(output, 'index.ts'))).toBe(false);
  expect(host.readFile(join(output, 'index.ts'))).toBeUndefined();
  expect(host.directoryExists!(output)).toBe(false);
  expect(host.getDirectories!(output)).toEqual([]);
  expect(probes).toEqual([]);
  expect(host.fileExists('/visible/index.ts')).toBe(true);
  expect(host.readFile('/visible/index.ts')).toBe('read:/visible/index.ts');
  expect(host.directoryExists!('/visible')).toBe(true);
  expect(host.getDirectories!('/visible')).toEqual([]);
  const full = roots.resolutionHost({
    ...minimal,
    directoryExists: () => false,
    getDirectories: () => ['output', 'other'],
  });
  expect(full.directoryExists!('/visible')).toBe(false);
  expect(full.getDirectories!(join(output, '..'))).toEqual(['other']);
});

test('an incompatible ts-morph missing-file contract fails loudly', () => {
  const real = new Project().getFileSystem();
  const Missing = missingFileError(real);
  expect(Missing).not.toBe(Error);
  expect(new Missing('/x')).toMatchObject({ code: 'ENOENT' });
  const fake = (readFileSync: () => string): FileSystemHost =>
    ({ ...real, readFileSync }) as unknown as FileSystemHost;
  class Custom extends Error {}
  for (const system of [
    fake(() => 'present'),
    fake(() => {
      throw Object.assign(new Error('plain'), { code: 'ENOENT' });
    }),
    fake(() => {
      throw new Custom('no code');
    }),
    fake(() => {
      throw 'not an error';
    }),
  ])
    expect(() => missingFileError(system)).toThrow(/NGDOC_SEMANTIC_OWNED_ROOTS/);
});

test('a non-owned symlink into an owned root is read through its own path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'semantic-owned-link-'));
  directories.push(directory);
  const output = join(directory, 'output');
  mkdirSync(output);
  writeFileSync(join(output, 'index.ts'), 'export const generated = 1;');
  writeFileSync(join(directory, 'plain.ts'), 'export const plain = 1;');
  symlinkSync(join(output, 'index.ts'), join(directory, 'link.ts'));
  const roots = new OwnedRoots([output]);
  const system = roots.fileSystem();
  expect(system.realpathSync(join(directory, 'link.ts'))).toBe(join(directory, 'link.ts'));
  expect(system.readFileSync(system.realpathSync(join(directory, 'link.ts')))).toContain(
    'generated',
  );
  expect(system.realpathSync(join(directory, 'plain.ts'))).toBe(
    realpathSync(join(directory, 'plain.ts')),
  );
  const host = roots.resolutionHost({ ...ts.sys });
  expect(host.realpath!(join(directory, 'link.ts'))).toBe(join(directory, 'link.ts'));
  expect(host.realpath!(join(directory, 'plain.ts'))).toBe(
    realpathSync(join(directory, 'plain.ts')),
  );
  expect(roots.resolutionHost({ fileExists: () => true, readFile: () => '' }).realpath).toBe(
    undefined,
  );
});

test('the missing-file probe names what it observed', () => {
  const real = new Project().getFileSystem();
  class Denied extends Error {
    readonly code = 'EACCES';
  }
  const system = {
    ...real,
    readFileSync: () => {
      throw new Denied('denied');
    },
  } as unknown as FileSystemHost;
  expect(() => missingFileError(system)).toThrow(/failed with Denied \(code EACCES\)/);
  const silent = { ...real, readFileSync: () => '' } as unknown as FileSystemHost;
  expect(() => missingFileError(silent)).toThrow(/did not fail/);
  const plain = {
    ...real,
    readFileSync: () => {
      throw Object.assign(new Error('plain'), { code: 'ENOENT' });
    },
  } as unknown as FileSystemHost;
  expect(() => missingFileError(plain)).toThrow(/failed with a plain error \(code ENOENT\)/);
});
