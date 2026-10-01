import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type Node, Project, Symbol as MorphSymbol, ts } from 'ts-morph';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type {
  ApiDescriptor,
  DiscoverySnapshot,
  GuideDescriptor,
  ServiceResult,
} from '../../contracts';
import {
  type Footprint,
  attachFootprint,
  contentDigest,
  footprintOf,
  FootprintScope,
  readIdentity,
  readText,
  recorderMode,
  SEMANTIC_RECORDER_ENV,
} from '../../kernel/footprint';
import {
  type RecordedAnswer,
  NODE_FACTORY_METHODS,
  openRecordingScopes,
  probeRecorder,
  recordedAnswer,
  recorderCompatibility,
  recordLookup,
  resetRecorderCompatibility,
  SemanticRecorder,
  suspendRecording,
} from '../recorder';
import { createSemanticService } from '../semantic-service';

const builderRoot = resolve(__dirname, '../../..');
const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  resetRecorderCompatibility();
  expect(openRecordingScopes()).toBe(0);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/**
 *
 */
function workspace(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'recorder-'));
  directories.push(directory);
  const all: Record<string, string> = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        noLib: true,
        target: 'ES2022',
        strict: true,
        experimentalDecorators: true,
      },
      include: ['*.ts'],
    }),
    'entry.ts': '/** Guide summary. */\nconst Page = {}; export default Page;',
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  return directory;
}

/**
 *
 */
function discovery(directory: string, include: string[]): DiscoverySnapshot {
  const common = {
    source: { path: join(directory, 'entry.ts') },
    title: 'Reference',
    route: 'api',
    absoluteRoute: 'docs/api',
    breadcrumbs: ['Reference'],
    runtimeImport: { source: join(directory, 'entry.ts'), exportName: 'default' },
    dependencies: [],
  };
  return {
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
        ...common,
        id: 'api',
        kind: 'api',
        scopes: [{ id: 'public', name: 'Public', route: 'public', include, exclude: [] }],
      } as ApiDescriptor,
      {
        ...common,
        id: 'guide',
        kind: 'guide',
        markdown: [join(directory, 'index.md')],
        hasImports: true,
      } as GuideDescriptor,
    ],
    globalKeywords: [],
    remoteKeywords: [],
  };
}

type Service = ReturnType<typeof createSemanticService>;
const services: Service[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose();
});

/**
 *
 */
async function synchronized(
  directory: string,
  include: string[],
  options: Parameters<typeof createSemanticService>[0] = { recorder: 'verify' },
): Promise<Service> {
  const service = createSemanticService(options);
  services.push(service);
  const result = await service.synchronize(
    { generation: 1, discovery: discovery(directory, include), changes: [] },
    new AbortController().signal,
  );
  expect(result.diagnostics).toEqual([]);
  return service;
}

const declarationId = (service: Service, name: string): string => {
  const listed = service.enumerateApi('api');
  expect(listed.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  const found = listed.value?.find((item) => item.name === name);
  expect(found, name).toBeDefined();
  return found!.id;
};

/**
 *
 */
function footprint(result: object): Footprint {
  const value = footprintOf(result);
  expect(value).toBeDefined();
  return value!;
}

const inMemory = (files: Record<string, string>): Project => {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipLoadingLibFiles: true,
    compilerOptions: { noLib: true, strict: true, target: ts.ScriptTarget.ES2022 },
  });
  for (const [path, text] of Object.entries(files)) project.createSourceFile(path, text);
  return project;
};

/** Runs `read` in one verify-mode scope on `project` and returns its footprint. */
function recorded(project: Project, read: () => void, mode: 'on' | 'verify' = 'verify'): Footprint {
  const scope = new SemanticRecorder(mode).open('capture', 'test', project);
  expect(scope).toBeDefined();
  try {
    read();
    return scope!.close();
  } finally {
    scope!.dispose();
  }
}

describe('kernel footprint', () => {
  test('parses the recorder mode; recording is on by default', () => {
    expect(recorderMode(undefined)).toBe('on');
    expect(recorderMode('')).toBe('on');
    expect(recorderMode('1')).toBe('on');
    expect(recorderMode(' VERIFY ')).toBe('verify');
    for (const value of ['0', 'off', 'false', 'no', 'OFF']) expect(recorderMode(value)).toBe('off');
    const previous = process.env[SEMANTIC_RECORDER_ENV];
    try {
      process.env[SEMANTIC_RECORDER_ENV] = '0';
      expect(recorderMode()).toBe('off');
    } finally {
      if (previous === undefined) delete process.env[SEMANTIC_RECORDER_ENV];
      else process.env[SEMANTIC_RECORDER_ENV] = previous;
    }
  });

  test('keeps the SHA-256 text digest formula and the read identities', () => {
    const directory = workspace({ 'text.ts': '﻿const é = 1;' });
    const text = readFileSync(join(directory, 'text.ts'), 'utf8');
    const expected = createHash('sha256').update(text).digest('hex');
    expect(contentDigest(text)).toBe(expected);
    expect(readText(join(directory, 'text.ts'))).toEqual({ text, digest: expected });
    expect(readIdentity({ kind: 'content', path: '/a', digest: 'x' })).toBe('/a');
    expect(readIdentity({ kind: 'existence', path: '/b', exists: false })).toBe('/b');
    expect(
      readIdentity({ kind: 'glob', root: '/r', include: ['*.ts'], exclude: ['x'], members: [] }),
    ).toBe('glob:/r:["*.ts"]:["x"]');
    expect(readIdentity({ kind: 'keyword', key: 'k', digest: 'd' })).toBeUndefined();
    expect(
      readIdentity({ kind: 'semantic-reference', scopeId: 's', digest: 'd', reason: 'r' }),
    ).toBeUndefined();
  });

  test('scopes collect, merge and seal; footprints attach out of band', () => {
    const scope = new FootprintScope('content-compile', 'id');
    scope.record('/b.ts', 'checker');
    scope.record('/a.ts', 'lookup');
    scope.observeAll([
      { kind: 'content', path: '/m.md', digest: 'x' },
      { kind: 'keyword', key: 'k', digest: 'd' },
    ]);
    scope.merge({
      scope: 'renderFragment',
      key: 'k',
      files: ['/c.ts'],
      reads: ['/t.nunj'],
      complete: true,
    });
    expect(scope.seal().complete).toBe(true);
    // A query that recorded nothing makes the footprint incomplete, never "depends on nothing".
    scope.merge(undefined);
    const sealed = scope.seal();
    expect(sealed).toEqual({
      scope: 'content-compile',
      key: 'id',
      files: ['/a.ts', '/b.ts', '/c.ts'],
      reads: ['/m.md', '/t.nunj'],
      complete: false,
    });
    const nested = new FootprintScope('content-compile', 'nested');
    nested.merge({ ...sealed, files: [] });
    expect(nested.seal()).toMatchObject({ files: [], complete: false });
    const verify = new FootprintScope('link', 'v', true);
    verify.record('/a.ts', 'checker');
    verify.record('/b.ts', 'checker');
    verify.record('/a.ts', 'node-factory');
    expect(verify.seal().channels).toEqual({
      checker: ['/a.ts', '/b.ts'],
      'node-factory': ['/a.ts'],
    });
    const result = { dependencies: [], diagnostics: [] };
    expect(footprintOf(result)).toBeUndefined();
    expect(footprintOf(undefined)).toBeUndefined();
    expect(attachFootprint(result, sealed)).toBe(result);
    expect(footprintOf(result)).toBe(sealed);
    expect(JSON.stringify(result)).toBe('{"dependencies":[],"diagnostics":[]}');
  });
});

describe('compatibility probe (pinned ts-morph 28.0.0 / TypeScript 6.0.x)', () => {
  test('asserts the checker delegation and all three node-factory wrappers', () => {
    const packageJson = (name: string) =>
      JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as {
        version: string;
      };
    expect(packageJson('ts-morph').version).toBe('28.0.0');
    expect(ts.version).toMatch(/^6\.0\./);
    expect(NODE_FACTORY_METHODS).toEqual([
      'getNodeFromCompilerNode',
      'getSourceFile',
      'getSourceFileForNode',
    ]);
    expect(probeRecorder()).toEqual({ ok: true, typescript: ts.version });
    expect(recorderCompatibility()).toBe(recorderCompatibility());
  });

  test('fails when TypeObject methods stop delegating through the checker', () => {
    const TypeObject = (
      ts as unknown as { objectAllocator: { getTypeConstructor(): { prototype: object } } }
    ).objectAllocator.getTypeConstructor();
    vi.spyOn(TypeObject.prototype as { getProperties(): unknown }, 'getProperties').mockReturnValue(
      [],
    );
    expect(probeRecorder()).toMatchObject({
      ok: false,
      reason: 'TypeObject methods do not delegate through the wrapped checker',
    });
  });

  test('fails when a wrapper bypasses the node factory', () => {
    interface Factory {
      getNodeFromCompilerNode(node: ts.Node, source: unknown): Node;
      getSourceFileForNode(node: ts.Node): unknown;
    }
    let probeProject: Project | undefined;
    const create = Project.prototype.createSourceFile;
    vi.spyOn(Project.prototype, 'createSourceFile').mockImplementation(function (
      this: Project,
      ...args: Parameters<Project['createSourceFile']>
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      probeProject = this;
      return create.apply(this, args);
    });
    vi.spyOn(MorphSymbol.prototype, 'getDeclarations').mockImplementation(function (
      this: MorphSymbol,
    ) {
      const factory = (probeProject as unknown as { _context: { compilerFactory: Factory } })
        ._context.compilerFactory;
      const prototype = Object.getPrototypeOf(factory) as Factory;
      // A wrapper made without asking the (wrapped) factory for the source file.
      return (this.compilerSymbol.declarations ?? []).map((node) =>
        factory.getNodeFromCompilerNode(node, prototype.getSourceFileForNode.call(factory, node)),
      );
    });
    expect(probeRecorder()).toMatchObject({
      ok: false,
      reason: 'ts-morph wrappers bypass CompilerFactory.getSourceFileForNode',
    });
  });

  test('fails when symbol documentation stops reaching the hooked SymbolObject methods', () => {
    vi.spyOn(MorphSymbol.prototype, 'getJsDocTags').mockReturnValue([]);
    expect(probeRecorder()).toMatchObject({
      ok: false,
      reason: 'ts-morph symbol documentation does not reach the hooked SymbolObject methods',
    });
  });

  test('fails when the language service or the factory is missing a method', () => {
    vi.spyOn(Project.prototype, 'getLanguageService').mockImplementation(
      () => ({ compilerObject: {} }) as ReturnType<Project['getLanguageService']>,
    );
    expect(probeRecorder()).toMatchObject({
      ok: false,
      reason: 'LanguageService.findReferences is missing',
    });
  });

  test('turns recording off, with the reason, and leaves query results unchanged', async () => {
    const directory = workspace({ 'public.ts': 'export interface First { value: string }' });
    const on = await synchronized(directory, ['public.ts'], { recorder: 'on' });
    const expected = on.enumerateApi('api');
    expect(footprintOf(expected)).toBeDefined();
    resetRecorderCompatibility();
    vi.spyOn(Project.prototype, 'getLanguageService').mockImplementationOnce(
      () => ({ compilerObject: {} }) as ReturnType<Project['getLanguageService']>,
    );
    const off = await synchronized(directory, ['public.ts'], { recorder: 'on' });
    const result = off.enumerateApi('api');
    expect(off.recording()).toEqual({
      mode: 'on',
      unavailable: 'LanguageService.findReferences is missing',
    });
    expect(footprintOf(result)).toBeUndefined();
    expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
  });

  test('an install failure is sticky and marks nothing half-installed', () => {
    const project = inMemory({
      '/src/shape.ts': 'export interface Shape { area(): number }',
      '/src/square.ts':
        "import { Shape } from './shape';\nexport class Square implements Shape {\n  area(): number {\n    return 1;\n  }\n}",
    });
    const service = project.getLanguageService().compilerObject as unknown as Record<
      string,
      unknown
    >;
    const missing = service['getImplementationAtPosition'];
    service['getImplementationAtPosition'] = undefined;
    const failing = new SemanticRecorder('on');
    expect(failing.open('capture', 'x', project)).toBeUndefined();
    expect(failing.unavailable).toBe('LanguageService.getImplementationAtPosition is missing');
    service['getImplementationAtPosition'] = missing;
    // Sticky: this recorder never re-installs part of the channels.
    expect(failing.open('capture', 'x', project)).toBeUndefined();
    expect(failing.ensure(project)).toBe(false);
    // Nothing was marked installed: a fresh recorder wraps all six queries.
    const position = project.getSourceFileOrThrow('/src/shape.ts').getFullText().indexOf('area');
    const result = recorded(project, () => {
      expect(
        project
          .getLanguageService()
          .compilerObject.getImplementationAtPosition('/src/shape.ts', position),
      ).toHaveLength(1);
    });
    expect(result.channels?.['language-service']).toEqual(['/src/square.ts']);
  });

  test('turns recording off when installing on a project fails', () => {
    const project = inMemory({ '/x.ts': 'export const x = 1;' });
    vi.spyOn(project, 'getProgram').mockImplementation(() => {
      throw new Error('no program');
    });
    const recorder = new SemanticRecorder('on');
    expect(recorder.open('capture', 'x', project)).toBeUndefined();
    expect(recorder.unavailable).toBe('no program');
    expect(new SemanticRecorder('off').open('capture', 'x', project)).toBeUndefined();
    expect(new SemanticRecorder('on').open('capture', 'x', undefined)).toBeUndefined();
  });

  test('reports a non-Error probe failure and a missing compiler factory', () => {
    vi.spyOn(Project.prototype, 'createSourceFile').mockImplementationOnce(() => {
      throw 'plain failure';
    });
    expect(probeRecorder()).toMatchObject({ ok: false, reason: 'plain failure' });
    const project = inMemory({ '/x.ts': 'export const x = 1;' });
    (project as unknown as { _context: { compilerFactory?: unknown } })._context.compilerFactory =
      undefined;
    const recorder = new SemanticRecorder('on');
    expect(recorder.open('capture', 'x', project)).toBeUndefined();
    expect(recorder.unavailable).toBe('ts-morph compiler factory is missing');
  });
});

describe('channels', () => {
  const files = {
    '/src/props.ts': 'export interface Props {\n  /** The size. */\n  size: number;\n}',
    '/src/user.ts':
      "import { Props } from './props';\nexport const used: Props = { size: 1 };\nexport const again: Props = used;",
  };

  test('checker: returned symbols record their declaration files', () => {
    const project = inMemory(files);
    const type = project
      .getSourceFileOrThrow('/src/user.ts')
      .getVariableDeclarationOrThrow('used')
      .getType();
    // Through TypeScript's own TypeObject method: no ts-morph wrapper is made.
    const recordedFootprint = recorded(project, () => {
      expect(type.compilerType.getProperties().map((property) => property.name)).toEqual(['size']);
    });
    expect(recordedFootprint.channels?.checker).toEqual(['/src/props.ts']);
    expect(recordedFootprint.channels?.['node-factory']).toBeUndefined();
    // ts-morph Symbol wrappers resolve their declarations eagerly, through the factory.
    const wrapped = recorded(project, () => void type.getProperties());
    expect(wrapped.channels?.checker).toEqual(['/src/props.ts']);
    expect(wrapped.channels?.['node-factory']).toEqual(['/src/props.ts']);
  });

  test('checker: signatures and index infos record their declarations', () => {
    const project = inMemory({
      '/src/fn.ts': 'export function run(value: number): string { return String(value); }',
      '/src/map.ts': 'export interface Dictionary { [key: string]: number }',
      '/src/use.ts':
        "import { run } from './fn';\nimport { Dictionary } from './map';\nexport const call = run;\nexport const dictionary: Dictionary = {};",
    });
    const source = project.getSourceFileOrThrow('/src/use.ts');
    const call = source.getVariableDeclarationOrThrow('call').getType().compilerType;
    const dictionary = source.getVariableDeclarationOrThrow('dictionary').getType().compilerType;
    const checker = project.getProgram().compilerObject.getTypeChecker();
    const result = recorded(project, () => {
      expect(checker.getSignaturesOfType(call, ts.SignatureKind.Call)).toHaveLength(1);
      expect(checker.getIndexInfosOfType(dictionary)).toHaveLength(1);
      expect(checker.typeToString(call)).toContain('number');
    });
    expect(result.channels?.checker).toEqual(expect.arrayContaining(['/src/fn.ts', '/src/map.ts']));
  });

  test('language service: findReferences records the referencing files', () => {
    const project = inMemory(files);
    const props = project
      .getSourceFileOrThrow('/src/props.ts')
      .getInterfaceOrThrow('Props')
      .getNameNode();
    const result = recorded(project, () => {
      expect(props.findReferences().length).toBeGreaterThan(0);
    });
    expect(result.channels?.['language-service']).toEqual(['/src/props.ts', '/src/user.ts']);
    expect(result.channels?.['node-factory']).toBeUndefined();
  });

  test('language service: the other five location queries record their result files', () => {
    const project = inMemory({
      '/src/shape.ts': 'export interface Shape {\n  area(): number;\n}',
      '/src/square.ts':
        "import { Shape } from './shape';\nexport class Square implements Shape {\n  area(): number {\n    return 1;\n  }\n}",
      '/src/use.ts':
        "import { Shape } from './shape';\nexport const shape: Shape = { area: () => 2 };\nexport const size = shape.area();",
    });
    const service = project.getLanguageService().compilerObject;
    const use = project.getSourceFileOrThrow('/src/use.ts');
    const text = use.getFullText();
    const at = (needle: string, from = 0) => text.indexOf(needle, from);
    const areaCall = at('area()', at('size'));
    const shapeType = at('Shape', at('const shape'));
    const shapeValue = at('shape', at('size'));
    const queries: Array<[string, () => unknown, string[]]> = [
      [
        'getReferencesAtPosition',
        () => service.getReferencesAtPosition('/src/use.ts', shapeType),
        ['/src/shape.ts', '/src/square.ts', '/src/use.ts'],
      ],
      [
        'findRenameLocations',
        () => service.findRenameLocations('/src/use.ts', shapeType, false, false, {}),
        ['/src/shape.ts', '/src/square.ts', '/src/use.ts'],
      ],
      [
        'getImplementationAtPosition',
        () => service.getImplementationAtPosition('/src/use.ts', areaCall),
        ['/src/square.ts', '/src/use.ts'],
      ],
      [
        'getDefinitionAtPosition',
        () => service.getDefinitionAtPosition('/src/use.ts', areaCall),
        ['/src/shape.ts'],
      ],
      [
        'getTypeDefinitionAtPosition',
        () => service.getTypeDefinitionAtPosition('/src/use.ts', shapeValue),
        ['/src/shape.ts'],
      ],
    ];
    for (const [name, query, expected] of queries) {
      const result = recorded(project, () => {
        expect(query(), name).toBeTruthy();
      });
      expect(result.channels?.['language-service'], name).toEqual(expect.arrayContaining(expected));
    }
  });

  test('explicit lookups are recorded only inside an active scope', () => {
    const project = inMemory(files);
    recordLookup('/outside.ts');
    const result = recorded(project, () => recordLookup('/src/looked-up.ts'));
    expect(result.channels?.lookup).toEqual(['/src/looked-up.ts']);
    expect(result.files).toEqual(['/src/looked-up.ts']);
  });

  test('node factory: records the returned wrapper file, not the caller file', () => {
    const project = inMemory(files);
    const symbol = project
      .getSourceFileOrThrow('/src/user.ts')
      .getVariableDeclarationOrThrow('used')
      .getType()
      .getSymbolOrThrow();
    const result = recorded(project, () => {
      const [declaration] = symbol.getDeclarations();
      expect(declaration?.getParentOrThrow().getKindName()).toBe('SourceFile');
    });
    expect(result.channels?.['node-factory']).toEqual(['/src/props.ts']);
    expect(result.channels?.checker).toBeUndefined();
    // `Node._getNodeFromCompilerNode` passes the caller's file; a cached foreign wrapper is still
    // recorded under its own file.
    const [declaration] = symbol.getDeclarations();
    const caller = project.getSourceFileOrThrow('/src/user.ts');
    const factory = (
      project as unknown as {
        _context: {
          compilerFactory: { getNodeFromCompilerNode(node: ts.Node, source: unknown): Node };
        };
      }
    )._context.compilerFactory;
    const viaCaller = recorded(project, () => {
      expect(factory.getNodeFromCompilerNode(declaration!.compilerNode, caller)).toBe(declaration);
    });
    expect(viaCaller.files).toEqual(['/src/props.ts']);
  });

  test('mixin base reached through intersection `.types[i].symbol.declarations`', () => {
    const project = inMemory({
      '/src/base.ts': 'export class Base {\n  /** Base value. */\n  value = 1;\n}',
      '/src/mixin.ts':
        'export type Ctor<T = {}> = new (...args: any[]) => T;\nexport interface Mixed {\n  mixed: boolean;\n}\nexport function Mixin<T>(Base: Ctor<T>): Ctor<T & Mixed> {\n  return Base as any;\n}',
      '/src/via.ts':
        "import { Base } from './base';\nimport { Mixin } from './mixin';\nexport class ViaMixin extends Mixin(Base) {}",
    });
    const via = project.getSourceFileOrThrow('/src/via.ts').getClassOrThrow('ViaMixin');
    const [base] = via.getBaseTypes();
    expect(base?.isIntersection()).toBe(true);
    // The early-stop template variant: read Base's docs through getIntersectionTypes() only.
    const result = recorded(project, () => {
      const docs = base!
        .getIntersectionTypes()
        .flatMap((part) => part.getSymbol()?.getDeclarations() ?? [])
        .filter((declaration) => declaration.getSourceFile().getBaseName() === 'base.ts')
        .map((declaration) => declaration.getText());
      expect(docs.join('')).toContain('Base value.');
    });
    expect(result.files).toContain('/src/base.ts');
    expect(result.channels?.['node-factory']).toContain('/src/base.ts');
    expect(result.channels?.checker ?? []).not.toContain('/src/base.ts');
  });
});

describe('symbol and signature documentation', () => {
  const docs = {
    '/src/a.ts': '/**\n * Alpha summary.\n * @remarks ALPHA\n */\nexport interface A { kind: 1 }',
    '/src/b.ts': '/** Beta. */\nexport interface B { kind: 2 }',
    '/src/holder.ts':
      "import { A } from './a';\nimport { B } from './b';\nexport interface UsesA { a: A }\nexport interface Holder { value: A | B }",
  };

  test('a cached ts-morph Symbol wrapper records its JSDoc files', () => {
    const project = inMemory(docs);
    const holder = project.getSourceFileOrThrow('/src/holder.ts');
    const usesA = holder.getInterfaceOrThrow('UsesA');
    // Another unit made (and cached) the A Symbol wrapper first.
    usesA.getPropertyOrThrow('a').getType().getSymbolOrThrow();
    const union = holder.getInterfaceOrThrow('Holder').getPropertyOrThrow('value').getType();
    const result = recorded(project, () => {
      const tags = union
        .getUnionTypes()
        .flatMap((part) => part.getSymbol()?.getJsDocTags() ?? [])
        .map((tag) => tag.getName());
      expect(tags).toEqual(['remarks']);
    });
    expect(result.files).toEqual(expect.arrayContaining(['/src/a.ts', '/src/b.ts']));
    expect(result.channels?.['symbol-docs']).toEqual(['/src/a.ts', '/src/b.ts']);
    // Only B's wrapper is new in this scope; A's cached wrapper reached no other channel.
    expect(result.channels?.['node-factory']).toEqual(['/src/b.ts']);
  });

  test('raw SymbolObject and SignatureObject documentation record their declarations', () => {
    const project = inMemory({
      ...docs,
      '/src/fn.ts': '/** Runs. @returns nothing */\nexport function run(): void {}',
      '/src/call.ts': "import { run } from './fn';\nexport const call = run;",
    });
    const union = project
      .getSourceFileOrThrow('/src/holder.ts')
      .getInterfaceOrThrow('Holder')
      .getPropertyOrThrow('value')
      .getType().compilerType as ts.UnionType;
    const [signature] = project
      .getSourceFileOrThrow('/src/call.ts')
      .getVariableDeclarationOrThrow('call')
      .getType()
      .compilerType.getCallSignatures();
    const checker = project.getProgram().compilerObject.getTypeChecker();
    const symbol = (name: string) => union.types.find((part) => part.symbol.name === name)!.symbol;
    const result = recorded(project, () => {
      expect(
        symbol('A')
          .getJsDocTags(checker)
          .map((tag) => tag.name),
      ).toEqual(['remarks']);
      expect(symbol('B').getDocumentationComment(checker).length).toBeGreaterThan(0);
      expect(signature!.getJsDocTags().map((tag) => tag.name)).toEqual(['returns']);
      expect(signature!.getDocumentationComment(checker).length).toBeGreaterThan(0);
    });
    expect(result.channels?.['symbol-docs']).toEqual(['/src/a.ts', '/src/b.ts', '/src/fn.ts']);
  });

  test('inherited documentation read by the first call is replayed on cached calls', () => {
    const project = inMemory({
      '/src/base.ts': 'export interface Base {\n  /** From base. */\n  run(): void;\n}',
      '/src/derived.ts':
        "import { Base } from './base';\nexport interface Derived extends Base {\n  run(): void;\n}",
    });
    const run = project
      .getSourceFileOrThrow('/src/derived.ts')
      .getInterfaceOrThrow('Derived')
      .getMethodOrThrow('run')
      .getSymbolOrThrow();
    const checker = project.getProgram().compilerObject.getTypeChecker();
    // First computed outside any scope; TypeScript caches the result on the symbol.
    const text = () => ts.displayPartsToString(run.compilerSymbol.getDocumentationComment(checker));
    expect(text()).toBe('From base.');
    const result = recorded(project, () => expect(text()).toBe('From base.'));
    expect(result.channels?.['symbol-docs']).toEqual(['/src/base.ts', '/src/derived.ts']);
  });

  test('contextual documentation readers are hooked too', () => {
    const project = inMemory(docs);
    const symbol = project
      .getSourceFileOrThrow('/src/holder.ts')
      .getInterfaceOrThrow('UsesA')
      .getPropertyOrThrow('a')
      .getType()
      .getSymbolOrThrow();
    const checker = project.getProgram().compilerObject.getTypeChecker();
    // TypeScript implements the contextual readers on symbols but leaves them out of the public typings.
    const contextual = symbol.compilerSymbol as ts.Symbol & {
      getContextualDocumentationComment(
        node: ts.Node | undefined,
        checker: ts.TypeChecker,
      ): unknown;
      getContextualJsDocTags(node: ts.Node | undefined, checker: ts.TypeChecker): unknown;
    };
    const result = recorded(project, () => {
      contextual.getContextualDocumentationComment(undefined, checker);
      contextual.getContextualJsDocTags(undefined, checker);
    });
    expect(result.channels?.['symbol-docs']).toEqual(['/src/a.ts']);
  });
});

describe('alias chains and export *', () => {
  const chain = {
    '/src/impl.ts': '/** The a value. */\nexport const a = 1;',
    '/src/mid.ts': "export { a } from './impl';",
    '/src/empty.ts': 'export {};',
    '/src/plain.ts': 'const notAModule = 1;',
    '/src/nested.ts': "export * from './deep';",
    '/src/deep.ts': 'export {};',
    '/src/barrel.ts':
      "export * from './empty';\nexport * from './plain';\nexport * from './nested';\nexport * from './mid';",
    '/src/consumer.ts': "import { a } from './barrel';\nexport const use = a;",
  };

  test('records every alias link, the modules they read from and every star target, empty ones included', () => {
    const project = inMemory(chain);
    const initializer = project
      .getSourceFileOrThrow('/src/consumer.ts')
      .getVariableDeclarationOrThrow('use')
      .getInitializerOrThrow();
    const result = recorded(project, () => {
      expect(initializer.getSymbolOrThrow().getAliasedSymbolOrThrow().getName()).toBe('a');
    });
    expect(result.channels?.checker).toEqual(
      expect.arrayContaining([
        '/src/consumer.ts',
        '/src/barrel.ts',
        '/src/empty.ts',
        '/src/plain.ts',
        '/src/nested.ts',
        '/src/deep.ts',
        '/src/mid.ts',
        '/src/impl.ts',
      ]),
    );
  });

  test('records every hop of a named re-export chain, not only its ends', () => {
    const project = inMemory({
      '/src/impl.ts': 'export const a = 1;',
      '/src/hop.ts': "export { a as b } from './impl';",
      '/src/outer.ts': "export { b as c } from './hop';",
      '/src/consumer.ts': "import { c } from './outer';\nexport const use = c;",
    });
    const initializer = project
      .getSourceFileOrThrow('/src/consumer.ts')
      .getVariableDeclarationOrThrow('use')
      .getInitializerOrThrow();
    const symbol = initializer.getSymbolOrThrow();
    const result = recorded(project, () => {
      expect(symbol.getAliasedSymbolOrThrow().getName()).toBe('a');
    });
    expect(result.channels?.checker).toEqual([
      '/src/consumer.ts',
      '/src/hop.ts',
      '/src/impl.ts',
      '/src/outer.ts',
    ]);
  });

  test('records the star closure of a module whose exports are resolved, even with no symbol from it', () => {
    const project = inMemory({
      ...chain,
      '/src/cycle-a.ts': "export * from './cycle-b';\nexport const fromA = 1;",
      '/src/cycle-b.ts': "export * from './cycle-a';\nexport * from './missing';",
    });
    const barrel = project.getSourceFileOrThrow('/src/barrel.ts');
    const cycle = project.getSourceFileOrThrow('/src/cycle-b.ts');
    const first = recorded(project, () => {
      expect([...barrel.getExportedDeclarations().keys()]).toEqual(['a']);
      expect([...cycle.getExportedDeclarations().keys()]).toEqual(['fromA']);
    });
    expect(first.files).toEqual(
      expect.arrayContaining([
        '/src/barrel.ts',
        '/src/empty.ts',
        '/src/plain.ts',
        '/src/deep.ts',
        '/src/cycle-a.ts',
        '/src/cycle-b.ts',
      ]),
    );
    // The memoized closure replays the same files into a later scope.
    const second = recorded(project, () => void barrel.getExportedDeclarations());
    expect(second.files).toEqual(expect.arrayContaining(['/src/empty.ts', '/src/deep.ts']));
  });

  test('import-equals, namespace and default imports read their modules too', () => {
    const project = inMemory({
      '/src/lib.ts': 'export default class Lib {}\nexport const n = 1;',
      '/src/eq.ts':
        "import lib = require('./lib');\nimport * as ns from './lib';\nimport Default from './lib';\nexport const values = [lib.n, ns.n, Default];",
    });
    const values = project
      .getSourceFileOrThrow('/src/eq.ts')
      .getVariableDeclarationOrThrow('values');
    const result = recorded(project, () => {
      for (const element of values
        .getInitializerIfKindOrThrow(ts.SyntaxKind.ArrayLiteralExpression)
        .getElements()) {
        const target = Node_expression(element);
        target.getSymbol()?.getAliasedSymbol();
      }
    });
    expect(result.channels?.checker).toEqual(expect.arrayContaining(['/src/eq.ts', '/src/lib.ts']));
  });
});

/** The leftmost identifier of `a.b` or `a`. */
function Node_expression(node: Node): Node {
  const expression = (node as Node & { getExpression?: () => Node }).getExpression?.();
  return expression ? Node_expression(expression) : node;
}

describe('suspension, replay and verify', () => {
  test('suspended reads are not recorded; nested scopes merge into their parent', () => {
    const project = inMemory({
      '/src/a.ts': 'export interface A { value: number }',
      '/src/b.ts': "import { A } from './a';\nexport const b: A = { value: 1 };",
    });
    const variable = project.getSourceFileOrThrow('/src/b.ts').getVariableDeclarationOrThrow('b');
    const recorder = new SemanticRecorder('verify');
    const outer = recorder.open('capture', 'outer', project)!;
    suspendRecording(() => variable.getType().getProperties());
    expect(outer.scope.files.size).toBe(0);
    const inner = recorder.open('capture', 'inner', project)!;
    variable.getType().getProperties();
    const innerFootprint = inner.close();
    expect(innerFootprint.files).toContain('/src/a.ts');
    const outerFootprint = outer.close();
    expect(outerFootprint.files).toEqual(innerFootprint.files);
    expect(outerFootprint.channels?.merge).toEqual(innerFootprint.files);
  });

  test('a cache hit replays the footprint its answer recorded, even when built while suspended', () => {
    const project = inMemory({
      '/src/a.ts': 'export interface A { value: number }',
      '/src/b.ts': "import { A } from './a';\nexport const b: A = { value: 1 };",
    });
    const variable = project.getSourceFileOrThrow('/src/b.ts').getVariableDeclarationOrThrow('b');
    const cache = new Map<string, RecordedAnswer<number>>();
    let computed = 0;
    const answer = () =>
      recordedAnswer(cache, '/src/b.ts#b', () => {
        computed++;
        return variable.getType().getProperties().length;
      });
    // Built while the caller's recording is suspended: the answer still captures its reads.
    const miss = recorded(project, () => expect(suspendRecording(answer)).toBe(1));
    expect(miss.files).toEqual([]);
    expect(cache.get('/src/b.ts#b')?.footprint.files).toContain('/src/a.ts');
    const hit = recorded(project, () => expect(answer()).toBe(1));
    expect(hit.files).toContain('/src/a.ts');
    expect(hit.channels?.merge).toContain('/src/a.ts');
    expect(computed).toBe(1);
    // Outside any scope a hit is still served.
    expect(answer()).toBe(1);
    const freshCache = new Map<string, RecordedAnswer<number>>();
    expect(recordedAnswer(freshCache, 'k', () => 2)).toBe(2);
    expect(() =>
      recordedAnswer(freshCache, 'throws', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(freshCache.has('throws')).toBe(false);
  });

  test('an answer computed while suspended is still verified, and a hit replays its gaps', () => {
    const project = inMemory({
      '/src/a.ts': '/** Docs. */\nexport interface A { value: number }',
      '/src/b.ts': 'export const b = 1;',
    });
    const held = project.getSourceFileOrThrow('/src/a.ts').getInterfaceOrThrow('A');
    const cache = new Map<string, RecordedAnswer<string>>();
    const answer = () => recordedAnswer(cache, '/src/a.ts#A', () => held.getText());
    const recorder = new SemanticRecorder('verify');
    const first = recorder.open('capture', 'first', project)!;
    expect(suspendRecording(answer)).toContain('interface A');
    expect(() => first.close()).toThrow(expect.objectContaining({ code: 'SEMANTIC_RECORDER_GAP' }));
    expect(cache.get('/src/a.ts#A')?.gaps).toContain('getText() on /src/a.ts');
    const second = recorder.open('capture', 'second', project)!;
    expect(answer()).toContain('interface A');
    expect(() => second.close()).toThrow(/getText\(\) on \/src\/a\.ts/);
    // Outside verify, gaps are carried but never thrown.
    const quiet = new SemanticRecorder('on').open('capture', 'quiet', project)!;
    answer();
    expect(quiet.close().files).toEqual([]);
  });

  test('verify mode fails a read of a node outside the footprint (SEMANTIC_RECORDER_GAP)', () => {
    const project = inMemory({
      '/src/a.ts': '/** Docs. */\nexport interface A { value: number }',
      '/src/b.ts': "import { A } from './a';\nexport const b: A = { value: 1 };",
    });
    const recorder = new SemanticRecorder('verify');
    const first = recorder.open('capture', 'first', project)!;
    const held = project.getSourceFileOrThrow('/src/a.ts').getInterfaceOrThrow('A');
    first.close();
    const second = recorder.open('capture', 'second', project)!;
    expect(held.getJsDocs()).toHaveLength(1);
    expect(held.getText()).toContain('interface A');
    expect(() => second.close()).toThrow(
      expect.objectContaining({ code: 'SEMANTIC_RECORDER_GAP' }),
    );
    // Gaps of an answer computed inside a verify scope reach the caller.
    const third = recorder.open('capture', 'third', project)!;
    recordedAnswer(new Map(), 'k', () => held.getFullText());
    expect(third.close(false).files).toEqual([]);
    expect(third.scope.gaps).toEqual(['getFullText() on /src/a.ts']);
    // `on` mode records without asserting.
    const on = new SemanticRecorder('on').open('capture', 'on', project)!;
    held.getText();
    expect(on.close().channels).toBeUndefined();
  });

  test('a failure while recording never changes the hooked call; verify reports it', () => {
    const project = inMemory({
      '/src/a.ts': 'export interface A { value: number }',
      '/src/b.ts': "import { A } from './a';\nexport const b: A = { value: 1 };",
    });
    const SymbolObject = (
      ts as unknown as {
        objectAllocator: { getSymbolConstructor(): new (flags: number, name: string) => ts.Symbol };
      }
    ).objectAllocator.getSymbolConstructor();
    const broken = new SymbolObject(ts.SymbolFlags.Property, 'broken');
    Object.defineProperty(broken, 'declarations', {
      get() {
        throw new Error('recording broke');
      },
    });
    const checker = project.getProgram().compilerObject.getTypeChecker();
    const recorder = new SemanticRecorder('verify');
    const scope = recorder.open('capture', 'failing', project)!;
    expect(checker.isArgumentsSymbol(broken)).toBe(false);
    expect(() => scope.close()).toThrow(/recorder failure: recording broke/);
    const quiet = new SemanticRecorder('on').open('capture', 'quiet', project)!;
    expect(checker.isArgumentsSymbol(broken)).toBe(false);
    expect(quiet.close().files).toEqual([]);
    expect(quiet.scope.gaps).toEqual(['recorder failure: recording broke']);
  });
});

describe('semantic service', () => {
  test('attaches a footprint to every query and changes no result in any mode', async () => {
    const directory = workspace({
      'public.ts':
        "import { Other } from './other';\n/** First. */\nexport interface First extends Other { value: string }",
      'other.ts':
        '/** Other. */\nexport interface Other {\n  /** Inherited. */\n  inherited: number;\n}',
      'index.md': '# Guide',
    });
    const queries = (service: Service): Array<ServiceResult<unknown>> => {
      const listed = service.enumerateApi('api');
      const id = listed.value!.find((item) => item.name === 'First')!.id;
      return [
        listed,
        service.describeGuide('guide'),
        service.renderFragment({ kind: 'entry-doc', entryId: 'guide' }),
        service.renderFragment({ kind: 'api-page', target: 'declaration', declarationId: id }),
        service.renderFragment({ kind: 'api-header', target: 'declaration', declarationId: id }),
        service.renderFragment({
          kind: 'api',
          entryId: 'guide',
          declarationPath: 'public.ts#First',
        }),
        service.renderFragment({
          kind: 'js-doc',
          entryId: 'guide',
          declarationPath: 'public.ts#First',
        }),
        service.renderFragment({
          kind: 'api',
          entryId: 'guide',
          declarationPath: 'public.ts#Missing',
        }),
        service.describeGuide('api'),
      ];
    };
    const off = queries(
      await synchronized(directory, ['public.ts', 'other.ts'], { recorder: 'off' }),
    );
    const on = queries(
      await synchronized(directory, ['public.ts', 'other.ts'], { recorder: 'on' }),
    );
    const verify = queries(
      await synchronized(directory, ['public.ts', 'other.ts'], { recorder: 'verify' }),
    );
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
    expect(JSON.stringify(verify)).toBe(JSON.stringify(off));
    off.forEach((result) => expect(footprintOf(result)).toBeUndefined());
    expect(on.map((result) => footprint(result).scope)).toEqual([
      'enumerateApi',
      'describeGuide',
      'entry-doc',
      'renderFragment',
      'renderFragment',
      'renderFragment',
      'renderFragment',
      'renderFragment',
      'describeGuide',
    ]);
    // Verify mode found no gap in any query (the failures are the queries' own).
    verify.forEach((result) =>
      expect(result.diagnostics.map((item) => item.code)).not.toContain('SEMANTIC_RECORDER_GAP'),
    );
    const page = footprint(on[3]!);
    expect(page.key).toMatch(/^api-page:declaration:/);
    expect(page.files).toEqual([join(directory, 'other.ts'), join(directory, 'public.ts')]);
    expect(page.reads).toEqual(
      expect.arrayContaining([resolve(builderRoot, 'templates/symbol/page.html.nunj')]),
    );
    expect(footprint(on[5]!).key).toBe('api:guide:public.ts#First');
    expect(footprint(on[2]!).files).toContain(join(directory, 'entry.ts'));
    expect(footprint(on[0]!).files).toContain(join(directory, 'public.ts'));
    // A failed query still carries what it read.
    expect(footprint(on[7]!).files).toContain(join(directory, 'public.ts'));
  });

  test('R of a page reading symbol JSDoc does not depend on render order', async () => {
    const directory = workspace({
      'a.ts':
        '/**\n * Alpha summary.\n * @remarks ALPHA-REMARK-FROM-A\n */\nexport interface A { kind: 1 }',
      'b.ts':
        '/**\n * Beta summary.\n * @remarks BETA-REMARK-FROM-B\n */\nexport interface B { kind: 2 }',
      'holder.ts':
        "import { A } from './a';\nimport { B } from './b';\n/** UsesA. */\nexport interface UsesA {\n  /** a. */\n  a: A;\n}\n/** Holder. */\nexport interface Holder {\n  /** Value. */\n  value: A | B;\n}",
      'templates/symbol/page.html.nunj':
        '{% for p in declaration.getProperties() %}{% set parts = p.getType().getUnionTypes() %}{% if parts.length == 0 %}{% set parts = [p.getType()] %}{% endif %}{% for t in parts %}{% set s = t.getSymbol() %}{% if s %}{% for tag in s.getJsDocTags() %}[{{ tag.getName() }}:{% for part in tag.compilerObject.text %}{{ part.text }}{% endfor %}]{% endfor %}{% endif %}{% endfor %}{% endfor %}',
    });
    const options = { recorder: 'verify' as const, templateRoot: join(directory, 'templates') };
    const alone = await synchronized(directory, ['holder.ts'], options);
    const holderAlone = alone.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarationId(alone, 'Holder'),
    });
    const ordered = await synchronized(directory, ['holder.ts'], options);
    ordered.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarationId(ordered, 'UsesA'),
    });
    const holderAfter = ordered.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarationId(ordered, 'Holder'),
    });
    expect(holderAlone.value?.value).toContain('ALPHA-REMARK-FROM-A');
    expect(holderAfter.value?.value).toBe(holderAlone.value?.value);
    expect(holderAfter.diagnostics).toEqual([]);
    expect(footprint(holderAlone).files).toContain(join(directory, 'a.ts'));
    expect(footprint(holderAfter).files).toEqual(footprint(holderAlone).files);
    expect(footprint(holderAfter).channels?.['symbol-docs']).toContain(join(directory, 'a.ts'));
  });

  test('interface extends an alias of a base in another file', async () => {
    const directory = workspace({
      'base.ts': 'export interface Base {\n  /** The base value. */\n  value: string;\n}',
      'alias.ts': "import { Base } from './base';\nexport type AliasOfBase = Base;",
      'x.ts':
        "import { AliasOfBase } from './alias';\n/** X. */\nexport interface X extends AliasOfBase {\n  own: number;\n}",
    });
    const service = await synchronized(directory, ['x.ts']);
    const page = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarationId(service, 'X'),
    });
    expect(page.diagnostics).toEqual([]);
    expect(page.value?.value).toContain('The base value.');
    // The inherited member and its JSDoc come from base.ts; alias.ts only decides which interface
    // the heritage clause names, which reaches R through x.ts's type closure.
    expect(footprint(page).files).toEqual(
      expect.arrayContaining([join(directory, 'base.ts'), join(directory, 'x.ts')]),
    );
    // A template that resolves the heritage name records the alias hop itself.
    const project = inMemory({
      '/src/base.ts': 'export interface Base { value: string }',
      '/src/alias.ts': "import { Base } from './base';\nexport type AliasOfBase = Base;",
      '/src/x.ts':
        "import { AliasOfBase } from './alias';\nexport interface X extends AliasOfBase {}",
    });
    const heritage = project
      .getSourceFileOrThrow('/src/x.ts')
      .getInterfaceOrThrow('X')
      .getExtends()[0]!;
    const resolved = recorded(project, () => {
      expect(heritage.getExpression().getSymbolOrThrow().getAliasedSymbolOrThrow().getName()).toBe(
        'AliasOfBase',
      );
    });
    expect(resolved.files).toEqual(['/src/alias.ts', '/src/x.ts']);
  });

  test('type-alias properties from another file with their JSDoc', async () => {
    const directory = workspace({
      'props.ts': 'export type Props = {\n  /** The size in pixels. */\n  size: number;\n};',
      'options.ts':
        "import * as shapes from './props';\n/** Options. */\nexport type Options = shapes.Props & {\n  /** Own. */\n  own: boolean;\n};",
    });
    const service = await synchronized(directory, ['options.ts']);
    const page = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarationId(service, 'Options'),
    });
    expect(page.diagnostics).toEqual([]);
    expect(page.value?.value).toContain('The size in pixels.');
    expect(footprint(page).files).toContain(join(directory, 'props.ts'));
  });

  test('a barrel-only scope records its empty star modules', async () => {
    const directory = workspace({
      'barrel.ts': "export * from './impl';\nexport * from './empty';\nexport * from './plain';",
      'impl.ts': '/** Thing. */\nexport interface Thing { value: number }',
      'empty.ts': 'export {};',
      'plain.ts': 'const notYetAModule = 1;',
    });
    const service = await synchronized(directory, ['barrel.ts']);
    const listed = service.enumerateApi('api');
    expect(listed.value?.map((item) => item.name)).toEqual(['Thing']);
    expect(footprint(listed).files).toEqual(
      expect.arrayContaining([
        join(directory, 'barrel.ts'),
        join(directory, 'impl.ts'),
        join(directory, 'empty.ts'),
        join(directory, 'plain.ts'),
      ]),
    );
  });

  test('the mixin base through a template that stops at the intersection', async () => {
    const directory = workspace({
      'base.ts': 'export class Base {\n  /** Base value. */\n  value = 1;\n}',
      'mixin.ts':
        'export type Ctor<T = {}> = new (...args: any[]) => T;\nexport interface Mixed {\n  mixed: boolean;\n}\nexport function Mixin<T>(Base: Ctor<T>): Ctor<T & Mixed> {\n  return Base as any;\n}',
      'via.ts':
        "import { Base } from './base';\nimport { Mixin } from './mixin';\n/** Via. */\nexport class ViaMixin extends Mixin(Base) {}",
      'templates/symbol/page.html.nunj':
        '{% for part in declaration.getBaseTypes()[0].getIntersectionTypes() %}{% set symbol = part.getSymbol() %}{% if symbol %}{% for node in symbol.getDeclarations() %}[{{ node.getText() }}]{% endfor %}{% endif %}{% endfor %}',
    });
    const service = await synchronized(directory, ['via.ts'], {
      recorder: 'verify',
      templateRoot: join(directory, 'templates'),
    });
    const page = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarationId(service, 'ViaMixin'),
    });
    expect(page.diagnostics).toEqual([]);
    expect(page.value?.value).toContain('Base value.');
    expect(footprint(page).files).toContain(join(directory, 'base.ts'));
  });

  test('a JSDoc `file=` snippet from a file the declaration does not import is a read', async () => {
    const directory = workspace({
      'documented.ts':
        '/**\n * Usage:\n *\n * ```ts file="./snippets/usage.ts"\n * ```\n */\nexport function documented(): void {}',
      'snippets/usage.ts': 'documented();',
    });
    const service = await synchronized(directory, ['documented.ts']);
    const page = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarationId(service, 'documented'),
    });
    expect(page.diagnostics).toEqual([]);
    expect(page.value?.value).toContain('documented();');
    expect(footprint(page).reads).toContain(join(directory, 'snippets/usage.ts'));
  });

  test('R of a class page does not depend on render order: the heritage index is suspended', async () => {
    const directory = workspace({
      'base.ts': '/** Base. */\nexport class Base {}',
      'sub.ts': "import { Base } from './base';\n/** Sub. */\nexport class Sub extends Base {}",
      'other.ts':
        "import { Unrelated } from './unrelated';\nexport class Other extends Unrelated {}",
      'unrelated.ts': 'export class Unrelated {}',
      'lone.ts': '/** Lone. */\nexport class Lone {}',
    });
    const include = ['base.ts', 'sub.ts', 'lone.ts'];
    const alone = await synchronized(directory, include);
    const loneAlone = footprint(
      alone.renderFragment({
        kind: 'api-page',
        target: 'declaration',
        declarationId: declarationId(alone, 'Lone'),
      }),
    );
    const ordered = await synchronized(directory, include);
    const base = ordered.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarationId(ordered, 'Base'),
    });
    expect(base.diagnostics).toEqual([]);
    expect(footprint(base).files).toContain(join(directory, 'sub.ts'));
    const loneAfter = footprint(
      ordered.renderFragment({
        kind: 'api-page',
        target: 'declaration',
        declarationId: declarationId(ordered, 'Lone'),
      }),
    );
    expect(loneAfter.files).toEqual(loneAlone.files);
    for (const files of [footprint(base).files, loneAfter.files]) {
      expect(files).not.toContain(join(directory, 'other.ts'));
      expect(files).not.toContain(join(directory, 'unrelated.ts'));
    }
  });

  test('a declaration path outside the program re-installs the checker on the new program', async () => {
    const directory = workspace({
      'public.ts': 'export interface First { value: string }',
      'extra/outside.ts':
        "import { Dep } from './dep';\n/** Outside. */\nexport interface Outside extends Dep {}",
      'extra/dep.ts':
        '/** Dep. */\nexport interface Dep {\n  /** From dep. */\n  fromDep: number;\n}',
    });
    const service = await synchronized(directory, ['public.ts']);
    const fragment = service.renderFragment({
      kind: 'api',
      entryId: 'guide',
      declarationPath: 'extra/outside.ts#Outside',
    });
    expect(fragment.diagnostics).toEqual([]);
    const recordedFootprint = footprint(fragment);
    expect(recordedFootprint.channels?.lookup).toContain(join(directory, 'extra/outside.ts'));
    expect(recordedFootprint.channels?.checker).toEqual(
      expect.arrayContaining([join(directory, 'extra/dep.ts')]),
    );
  });

  test('the environment selects the mode; a disposed service records nothing', async () => {
    const directory = workspace({ 'public.ts': 'export interface First { value: string }' });
    const previous = process.env[SEMANTIC_RECORDER_ENV];
    try {
      process.env[SEMANTIC_RECORDER_ENV] = 'off';
      const off = await synchronized(directory, ['public.ts'], {});
      expect(off.recording()).toEqual({ mode: 'off' });
      expect(footprintOf(off.enumerateApi('api'))).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env[SEMANTIC_RECORDER_ENV];
      else process.env[SEMANTIC_RECORDER_ENV] = previous;
    }
    const on = await synchronized(directory, ['public.ts'], {});
    expect(on.recording()).toEqual({
      mode: previous === undefined ? 'on' : recorderMode(previous),
    });
    await on.dispose();
    const disposed = on.enumerateApi('api');
    expect(disposed.diagnostics.map((item) => item.code)).toEqual(['SEMANTIC_CANCELLED']);
    expect(footprintOf(disposed)).toBeUndefined();
  });
});
