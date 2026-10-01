import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ClassDeclaration, LanguageService, Node, Project, ts } from 'ts-morph';
import { afterEach, expect, test, vi } from 'vitest';

import type { ApiDescriptor, DiscoverySnapshot } from '../../contracts';
import {
  DerivedClassIndex,
  derivedClassIndex,
  getDerivedClasses,
  withIndexedDerivedClasses,
} from '../derived-classes';
import { createSemanticService } from '../semantic-service';

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function project(files: Record<string, string>, options: ts.CompilerOptions = {}): Project {
  const result = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, strict: true, noLib: true, ...options },
  });
  for (const [path, text] of Object.entries(files)) result.createSourceFile(path, text);
  return result;
}
const classes = (value: Project): ClassDeclaration[] =>
  value
    .getSourceFiles()
    .flatMap((file) => file.getDescendantsOfKind(ts.SyntaxKind.ClassDeclaration));
const find = (value: Project, name: string): ClassDeclaration =>
  classes(value).find((item) => item.getName() === name)!;
const label = (item: ClassDeclaration) =>
  `${item.getSourceFile().getBaseName()}:${item.getName() ?? '<anonymous>'}`;

/** The index result must be ts-morph's own result: same nodes, same order, for every class. */
function expectParity(value: Project): void {
  const index = derivedClassIndex(value);
  for (const declaration of classes(value)) {
    const expected = declaration.getDerivedClasses();
    const actual = getDerivedClasses(declaration, index);
    expect(actual.map(label), label(declaration)).toEqual(expected.map(label));
    actual.forEach((item, position) => expect(item).toBe(expected[position]));
    if (expected.length) expect(index.mayHaveDerivedClasses(declaration)).toBe(true);
  }
}

const hierarchy = {
  '/src/base.ts': [
    'export class Base<T = unknown> { value?: T; }',
    'export default class DefaultBase {}',
    'export interface Shape {}',
    'export class Unused {}',
  ].join('\n'),
  '/src/chain.ts': [
    "import { Base } from './base';",
    'export class Middle extends Base<string> {}',
    'export class Leaf extends Middle {}',
    'export class DeepLeaf extends Leaf {}',
  ].join('\n'),
  '/src/barrel.ts': "export * from './base';\nexport { Base as Renamed } from './base';",
  '/src/aliases.ts': [
    "import { Base as Parent } from './base';",
    "import { Renamed } from './barrel';",
    "import * as ns from './barrel';",
    "import DefaultParent from './base';",
    'export class ViaImportRename extends Parent<number> {}',
    'export class ViaExportRename extends Renamed {}',
    'export class ViaNamespace extends ns.Base {}',
    'export class ViaDefault extends DefaultParent {}',
    'export default class extends Parent {}',
  ].join('\n'),
  '/src/not-subclasses.ts': [
    "import { Base, Shape } from './base';",
    'export interface ExtendsClass extends Base {}',
    'export interface ExtendsInterface extends Shape {}',
    'export class Implements implements Base, Shape { value?: unknown; }',
    'export const Expression = class extends Base {};',
    'const mixin = <C extends new (...args: any[]) => object>(base: C) => class extends base {};',
    'export class ViaMixin extends mixin(Base) {}',
    'export function local() { class Nested extends Base {} return Nested; }',
  ].join('\n'),
  '/src/cycle.ts': 'export class CycleA extends CycleB {}\nexport class CycleB extends CycleA {}',
  '/types/ambient.d.ts':
    "import { Base } from '../src/base';\nexport declare class Ambient extends Base {}",
};

test('matches ts-morph for chains, generics, aliases, re-exports, interfaces, expressions and cycles', () => {
  const value = project(hierarchy);
  expectParity(value);
  const index = derivedClassIndex(value);
  const names = (name: string) =>
    getDerivedClasses(find(value, name), index).map((item) => item.getName() ?? '<anonymous>');
  expect(names('Base').sort()).toEqual(
    [
      'Ambient',
      'DeepLeaf',
      'Leaf',
      'Middle',
      'Nested',
      'ViaExportRename',
      'ViaImportRename',
      'ViaNamespace',
      '<anonymous>',
    ].sort(),
  );
  expect(names('Middle')).toEqual(['Leaf', 'DeepLeaf']);
  expect(names('DefaultBase')).toEqual(['ViaDefault']);
  expect(names('DeepLeaf')).toEqual([]);
  // A cycle never lists the class itself and terminates.
  expect(names('CycleA')).toEqual(['CycleB']);
  expect(names('CycleB')).toEqual(['CycleA']);
});

test('the index records only extends clauses of class declarations, by name and by alias target', () => {
  const value = project(hierarchy);
  const index = new DerivedClassIndex(value.getProgram().compilerObject);
  const may = (name: string) => index.mayHaveDerivedClasses(find(value, name));
  // Base is reached through aliases whose text differs (Parent, Renamed) and by its own name.
  expect(may('Base')).toBe(true);
  expect(may('DefaultBase')).toBe(true); // only as `DefaultParent`, through the default export
  expect(may('Middle')).toBe(true);
  for (const leaf of ['DeepLeaf', 'Unused', 'Implements', 'ViaMixin', 'Ambient', 'ViaDefault'])
    expect(may(leaf), leaf).toBe(false);
  const anonymous = classes(value).find((item) => !item.getName())!;
  expect(index.mayHaveDerivedClasses(anonymous)).toBe(false);
  expect(getDerivedClasses(anonymous, index)).toEqual([]);
});

test('a renamed import is found through its alias target even when no extends clause names the class', () => {
  const value = project({
    '/base.ts': 'export class Original {}',
    '/child.ts': "import { Original as Other } from './base';\nexport class Child extends Other {}",
  });
  const index = derivedClassIndex(value);
  expect(index.mayHaveDerivedClasses(find(value, 'Original'))).toBe(true);
  expect(getDerivedClasses(find(value, 'Original'), index).map((item) => item.getName())).toEqual([
    'Child',
  ]);
  expectParity(value);
});

test('an unresolved base stays conservative by name and still matches ts-morph', () => {
  const value = project({
    '/base.ts': 'export class Missing {}',
    '/child.ts':
      "import { Missing } from './does-not-exist';\nexport class Child extends Missing {}",
  });
  expect(derivedClassIndex(value).mayHaveDerivedClasses(find(value, 'Missing'))).toBe(true);
  expectParity(value);
});

test('leaf subclasses run no reference search; ts-morph searches once per subclass', () => {
  const files: Record<string, string> = { '/base.ts': 'export class Root {}' };
  for (let item = 0; item < 40; item++)
    files[`/page-${item}.ts`] =
      `import { Root } from './base';\nexport class PageComponent extends Root {}`;
  const value = project(files);
  const service = value.getLanguageService();
  const search = vi.spyOn(service, 'findReferencesAsNodes');
  const root = find(value, 'Root');
  const indexed = getDerivedClasses(root, derivedClassIndex(value));
  expect(search).toHaveBeenCalledTimes(1);
  search.mockClear();
  const original = root.getDerivedClasses();
  expect(search).toHaveBeenCalledTimes(41);
  expect(indexed).toEqual(original);
  expect(indexed).toHaveLength(40);
});

test('one index per program: reused while unchanged, rebuilt after the program changes', () => {
  const value = project({ '/base.ts': 'export class Base {}' });
  const first = derivedClassIndex(value);
  expect(derivedClassIndex(value)).toBe(first);
  expect(getDerivedClasses(find(value, 'Base'), first)).toEqual([]);
  value.createSourceFile(
    '/late.ts',
    "import { Base } from './base';\nexport class Late extends Base {}",
  );
  const second = derivedClassIndex(value);
  expect(second).not.toBe(first);
  expect(getDerivedClasses(find(value, 'Base'), second).map((item) => item.getName())).toEqual([
    'Late',
  ]);
  expectParity(value);
});

test('files outside the program are never listed; excluded files imported by the program are', () => {
  const directory = mkdtempSync(join(tmpdir(), 'semantic-derived-'));
  directories.push(directory);
  const write = (path: string, text: string) => {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  write('src/base.ts', 'export class Base {}');
  write('src/included.ts', "import { Base } from './base';\nexport class Included extends Base {}");
  write(
    'excluded/orphan.ts',
    "import { Base } from '../src/base';\nexport class Orphan extends Base {}",
  );
  write(
    'excluded/imported.ts',
    "import { Base } from '../src/base';\nexport class Imported extends Base {}",
  );
  write('src/uses.ts', "export { Imported } from '../excluded/imported';");
  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { noLib: true, strict: true }, include: ['src'] }),
  );
  const value = new Project({ tsConfigFilePath: join(directory, 'tsconfig.json') });
  value.resolveSourceFileDependencies();
  const derived = getDerivedClasses(find(value, 'Base'), derivedClassIndex(value));
  expect(derived.map((item) => item.getName()).sort()).toEqual(['Imported', 'Included']);
  expectParity(value);
});

test('rendering serves the index only for the duration of one class render', () => {
  const value = project({
    '/base.ts': 'export class Base {}\nexport interface Shape {}',
    '/child.ts': "import { Base } from './base';\nexport class Child extends Base {}",
  });
  const base = find(value, 'Base');
  const seen = withIndexedDerivedClasses(base, value, () => {
    expect(Object.hasOwn(base, 'getDerivedClasses')).toBe(true);
    // Nested use keeps the outer override.
    withIndexedDerivedClasses(base, value, () => undefined);
    expect(Object.hasOwn(base, 'getDerivedClasses')).toBe(true);
    return base.getDerivedClasses().map((item) => item.getName());
  });
  expect(seen).toEqual(['Child']);
  expect(Object.hasOwn(base, 'getDerivedClasses')).toBe(false);
  expect(() =>
    withIndexedDerivedClasses(base, value, () => {
      throw new Error('render failed');
    }),
  ).toThrow('render failed');
  expect(Object.hasOwn(base, 'getDerivedClasses')).toBe(false);
  const shape = value.getSourceFileOrThrow('/base.ts').getInterfaceOrThrow('Shape');
  expect(withIndexedDerivedClasses(shape, value, () => Node.isInterfaceDeclaration(shape))).toBe(
    true,
  );
  expect(Object.hasOwn(shape, 'getDerivedClasses')).toBe(false);
});

test('API See Also through the semantic service lists user subclasses, never owned output', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'semantic-derived-service-'));
  directories.push(directory);
  const write = (path: string, text: string) => {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true },
      include: ['*.ts', 'output/**/*.ts'],
    }),
  );
  write('entry.ts', 'const Page = {}; export default Page;');
  write(
    'public.ts',
    '/** Base docs. */\nexport class Base {}\n/** Middle docs. */\nexport class Middle extends Base {}\n' +
      '/** Leaf docs. */\nexport class Leaf extends Middle {}\n/** Alone. */\nexport class Alone {}\n',
  );
  const leaves = Array.from({ length: 30 }, (_, item) => `Extra${item}`);
  write(
    'leaves.ts',
    `import { Base } from './public';\n${leaves.map((name) => `export class ${name} extends Base {}`).join('\n')}`,
  );
  write(
    'output/page.ts',
    "import { Base } from '../public';\nexport class PageComponent extends Base {}",
  );
  const configuration = {
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
    inlineStyleLanguage: 'SCSS' as const,
    anchorHeadings: ['h2' as const],
    themes: { light: 'github-light', dark: 'github-dark' },
    cacheEnabled: true,
    digest: 'config',
    executables: [],
  };
  const entry: ApiDescriptor = {
    kind: 'api',
    id: 'api',
    source: { path: join(directory, 'entry.ts') },
    title: 'API',
    route: 'api',
    absoluteRoute: 'docs/api',
    breadcrumbs: ['API'],
    runtimeImport: { source: join(directory, 'entry.ts'), exportName: 'default' },
    dependencies: [],
    scopes: [{ id: 'scope', name: 'Public', route: 'public', include: ['public.ts'], exclude: [] }],
  };
  const discovery = { configuration, entries: [entry], remoteKeywords: [], globalKeywords: [] };
  const service = createSemanticService();
  const synchronized = await service.synchronize(
    { generation: 1, discovery: discovery as DiscoverySnapshot, changes: [] },
    new AbortController().signal,
  );
  expect(synchronized.diagnostics).toEqual([]);
  const declarations = service.enumerateApi('api').value!;
  const page = (name: string) =>
    service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarations.find((item) => item.name === name)!.id,
    }).value!.value as string;
  // The symbol view lists derived classes in the Extended by list.
  const seeAlso = (name: string) =>
    [
      ...(/<dl class="ng-doc-api-extended"[\s\S]*?<\/dl>/.exec(page(name))?.[0] ?? '').matchAll(
        /<code>(\w+)<\/code>/g,
      ),
    ].map((match) => match[1]);
  const search = vi.spyOn(LanguageService.prototype, 'findReferencesAsNodes');
  expect(seeAlso('Base').sort()).toEqual(['Middle', 'Leaf', ...leaves].sort());
  // Only Base and Middle have subclasses; ts-morph alone would also search Leaf and each leaf.
  expect(search).toHaveBeenCalledTimes(2);
  search.mockRestore();
  expect(seeAlso('Middle')).toEqual(['Leaf']);
  expect(seeAlso('Leaf')).toEqual([]);
  expect(page('Alone')).not.toContain('See Also');
  expect(page('Alone')).not.toContain('Extended by');
  await service.dispose();
});
