import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';

import type { CompilationResult, JsonValue } from '../../contracts';
import { createWorkerCompilationService } from '../index';

const repository = path.resolve(import.meta.dirname, '../../../../..');
let temporary: string;
// NGDOC_TEST_EVIDENCE_DIR when a runner collects the summaries; otherwise the suite's own temp
// directory (removed in afterAll). A plain run never writes into tracked docs/ evidence.
const evidence = (): string => process.env['NGDOC_TEST_EVIDENCE_DIR'] ?? temporary;
let factoryUrl: URL;
let entryUrl: URL;

beforeAll(async () => {
  temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'ngdoc-real-worker-')));
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  // Packages stay real external runtime dependencies. No source module or template stand-ins.
  await symlink(path.join(repository, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  const compilerFile = path.join(temporary, 'compiler.mjs');
  const bundled = await build({
    absWorkingDir: repository,
    entryPoints: ['libs/builder/generator/compiler/index.ts'],
    outfile: compilerFile,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    metafile: true,
    alias: {
      '@ng-doc/core': path.join(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(repository, 'libs/utils/index.ts'),
    },
  });

  const inputs = Object.keys(bundled.metafile.inputs).sort();
  const emittedImports = Object.values(bundled.metafile.outputs).flatMap(
    (output) => output.imports,
  );
  expect(inputs).toContain('libs/builder/generator/compiler/index.ts');
  expect(inputs).toContain('libs/builder/generator/discovery/index.ts');
  expect(inputs).toContain('libs/builder/generator/semantic/semantic-service.ts');
  expect(inputs).toContain('libs/builder/generator/content/content-compiler.ts');
  expect(inputs).toContain('libs/builder/generator/artifacts/index.ts');
  expect(inputs).toContain('libs/builder/generator/graph/index.ts');
  expect(inputs).toContain('libs/builder/generator/outputs/index.ts');
  expect(inputs.filter((input) => /libs\/builder\/(engine\/|index\.ts$)/.test(input))).toEqual([]);
  expect(
    emittedImports.filter((item) => /@ng-doc\/builder|@angular-devkit\/architect/.test(item.path)),
  ).toEqual([]);
  await writeFile(
    path.join(evidence(), 'actual-composition-bundle.json'),
    JSON.stringify({ inputs, emittedImports }, null, 2),
  );
  await build({
    entryPoints: [
      path.join(repository, 'libs/builder/generator/worker/entry.ts'),
      path.join(repository, 'libs/builder/generator/worker/protocol.ts'),
    ],
    outdir: path.join(temporary, 'worker'),
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });

  factoryUrl = pathToFileURL(compilerFile);

  entryUrl = pathToFileURL(path.join(temporary, 'worker/entry.js'));
});

afterAll(async () => {
  await rm(temporary, { recursive: true, force: true });
});

test('real production compiler crosses process/JSON boundaries and restores identical complete warm artifacts', async () => {
  const workspaceRoot = path.join(temporary, 'workspace');
  async function source(file: string, text: string): Promise<string> {
    const target = path.join(workspaceRoot, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
    return target;
  }
  const tsConfig = await source(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/**/*.ts'],
    }),
  );
  const processLog = path.join(workspaceRoot, 'processes.log');
  const configFile = await source(
    'ng-doc.config.ts',
    `import { appendFileSync } from 'node:fs'; import process from 'node:process'; appendFileSync(${JSON.stringify(processLog)}, process.pid + '\\n'); export default { docsPath: 'docs', cache: true };`,
  );
  await source(
    'docs/ng-doc.api.ts',
    `/** Public API. */ const api = { title: 'API', route: 'api', scopes: [{ name: 'Public', route: 'public', include: ['docs/api.ts'] }] }; export default api;`,
  );
  await source(
    'docs/api.ts',
    '/** Actual API class. */ export class Actual { /** Current value. */ value = 1; }',
  );
  await source(
    'docs/guide/ng-doc.page.ts',
    `import { Demo } from './demo';
/** Guide description. */
const guide = { title: 'Guide', route: 'guide', mdFile: './index.md', demos: { Demo } };
export default guide;`,
  );
  await source(
    'docs/guide/demo.ts',
    `import { Component } from '@angular/core'; @Component({ selector: 'actual-worker-demo', template: '<b>Demo-only searchable marker</b>' }) export class Demo {}`,
  );
  await source(
    'docs/guide/index.md',
    '---\nkeyword: Guide\n---\n# Worker guide\n\nReal subprocess content links to `Actual`.\n\n{{ NgDocActions.demo("Demo") }}',
  );
  const outputRoot = path.join(workspaceRoot, 'out');
  const cacheRoot = path.join(workspaceRoot, 'cache');
  const factoryOptions: JsonValue = {
    projectId: 'real-worker',
    workspaceRoot,
    configFile,
    defaults: { docsRoot: path.join(workspaceRoot, 'docs'), tsConfig, outputRoot, cacheRoot },
    compilerVersion: 'real-worker-test',
    toolchainDigest: 'node24-ts6-shiki',
    templateRoot: path.join(repository, 'libs/builder/templates'),
  };
  const proxy = createWorkerCompilationService({
    moduleUrl: factoryUrl,
    workerEntryUrl: entryUrl,
    factoryOptions,
    startupTimeoutMs: 30_000,
    compileTimeoutMs: 60_000,
  });
  const snapshot = (result: CompilationResult) => {
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(result.candidate).toBeDefined();
    return result.candidate!;
  };
  try {
    const coldResult = await proxy.compile(
      { generation: 1, mode: 'production', changes: [] },
      new AbortController().signal,
    );
    const cold = snapshot(coldResult);
    expect(cold.configuration).toMatchObject({ outputRoot, cacheRoot, assetDirectory: 'assets' });
    expect(cold.configuration?.digest).toEqual(expect.any(String));
    const searches = cold.artifacts.flatMap((artifact) => artifact.searchRecords);
    const content = cold.artifacts.flatMap((artifact) => artifact.content);
    const outputs = cold.artifacts.flatMap((artifact) => artifact.outputs);
    expect(cold.artifacts).toHaveLength(4);
    expect(searches).toHaveLength(4);
    // Physical content modules are separate from Angular shells, so every linked body/header page
    // directory also gets page.content.mjs, page.source.mjs and their .d.mts: 4 sidecars x 4 page
    // directories = 16 more `content` outputs than the original 13.
    expect(outputs).toHaveLength(29);
    expect(
      outputs.reduce<Record<string, number>>((counts, output) => {
        counts[output.role] = (counts[output.role] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({
      angular: 6,
      'api-list': 1,
      asset: 1,
      content: 18,
      context: 1,
      routes: 1,
      search: 1,
    });
    expect(
      outputs.filter((output) => /\/page\.(content|source)\.(mjs|d\.mts)$/.test(output.path)),
    ).toHaveLength(16);
    expect(searches.map((record) => record.pageType).sort()).toEqual([
      'api',
      'api',
      'guide',
      'guide',
    ]);
    const publishedContent = content.filter(
      (item) =>
        item.ir.role === 'api-tab' || item.ir.role === 'guide-tab' || item.ir.role === 'header',
    );
    const publishedSearches = publishedContent.flatMap((item) => item.searchRecords);
    expect(searches).toEqual(publishedSearches);
    expect(content.filter((item) => item.ir.role === 'header')).toHaveLength(3);
    const headerSearches = content
      .filter((item) => item.ir.role === 'header')
      .flatMap((item) => item.searchRecords);
    expect(headerSearches).toHaveLength(2);
    const demoAssets = content.filter((item) => item.ir.role === 'demo-assets');
    expect(demoAssets).toHaveLength(1);
    const demoSearches = demoAssets.flatMap((item) => item.searchRecords);
    expect(demoAssets[0]?.html).toContain('Demo-only searchable marker');
    expect(searches.some((record) => record.content.includes('Demo-only searchable marker'))).toBe(
      false,
    );
    for (const description of ['Guide description.', 'Public API.']) {
      expect(headerSearches.some((record) => record.content.includes(description))).toBe(true);
    }
    expect(searches.some((record) => record.content.includes('Actual API class.'))).toBe(true);
    expect(searches.some((record) => record.content.includes('Real subprocess content'))).toBe(
      true,
    );
    expect(
      cold.artifacts.flatMap((artifact) => artifact.apiList).map((item) => item.name),
    ).toContain('Actual');
    expect(content.find((item) => item.ir.role === 'guide-tab')?.html).toContain('/Actual');
    expect(outputs.some((output) => output.role === 'search')).toBe(true);
    expect(outputs.some((output) => output.role === 'routes')).toBe(true);
    expect(outputs.some((output) => output.role === 'angular')).toBe(true);
    expect(coldResult.whyRebuilt.some((reason) => reason.reason === 'initial')).toBe(true);
    expect(JSON.parse(JSON.stringify(cold))).toEqual(cold);
    // No previous DTO is supplied: the next fresh process must restore the real persistent cache.
    const warmResult = await proxy.compile(
      { generation: 2, mode: 'production', changes: [] },
      new AbortController().signal,
    );
    const warm = snapshot(warmResult);
    expect(warm).toEqual(cold);
    expect(warmResult.whyRebuilt).toEqual([]);
    const transportedPrevious = JSON.parse(JSON.stringify(warm)) as typeof warm;
    const retainedResult = await proxy.compile(
      {
        generation: 3,
        mode: 'production',
        changes: [],
        previous: transportedPrevious,
      },
      new AbortController().signal,
    );
    const retained = snapshot(retainedResult);
    expect(retained).toEqual(cold);
    expect(retainedResult.whyRebuilt).toHaveLength(4);
    expect([...new Set(retainedResult.whyRebuilt.map((reason) => reason.reason))]).toEqual([
      'output-missing',
    ]);
    const processIds = (await readFile(processLog, 'utf8')).trim().split('\n').map(Number);
    expect(new Set(processIds).size).toBe(3);
    expect(processIds).not.toContain(process.pid);
    // Compilation produces candidate DTOs and cache data; the parent committer owns publication.
    await expect(stat(outputRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(
      path.join(evidence(), 'actual-composition-summary.json'),
      JSON.stringify(
        {
          generationCount: 3,
          processIds,
          artifacts: cold.artifacts.length,
          artifactRoles: cold.artifacts.map((artifact) => artifact.identity.role).sort(),
          linkedContentRoles: content.map((item) => item.ir.role).sort(),
          searchRecords: searches.length,
          searchPageTypes: searches.map((record) => record.pageType).sort(),
          publishedSearchContentRoles: publishedContent
            .filter((item) => item.searchRecords.length > 0)
            .map((item) => item.ir.role)
            .sort(),
          headerSearchRecords: headerSearches.length,
          demoAssetLinkedSearchRecords: demoSearches.length,
          demoAssetMarkerPublished: searches.some((record) =>
            record.content.includes('Demo-only searchable marker'),
          ),
          outputs: outputs.length,
          outputRoles: Object.fromEntries(
            Object.entries(
              outputs.reduce<Record<string, number>>((counts, output) => {
                counts[output.role] = (counts[output.role] ?? 0) + 1;
                return counts;
              }, {}),
            ).sort(([left], [right]) => left.localeCompare(right)),
          ),
          jsonRoundTripVerified: true,
          coldRevision: cold.revision,
          warmRevision: warm.revision,
          persistentWarmRebuildReasons: warmResult.whyRebuilt,
          previousSnapshotRebuildReasons: retainedResult.whyRebuilt,
          diagnostics: [coldResult.diagnostics, warmResult.diagnostics, retainedResult.diagnostics],
        },
        null,
        2,
      ),
    );
  } finally {
    await proxy.dispose();
  }
});
