import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { ApiDescriptor, DiscoverySnapshot } from '../../contracts';
import type { RetainedProgram } from '../program-state';
import { firstFactDifference, programFacts } from '../program-verify';
import {
  type IncrementalProgramMode,
  type RetainedSemanticState,
  type SemanticServiceImpl,
  createSemanticService,
  SEMANTIC_PATCH_MISMATCH,
} from '../semantic-service';
import { hostPath, join } from './engine-paths';

// `verify` compares the semantic facts of a patched program with a cold one, not only its texts:
// with the documentation cache fix disabled, a reused symbol answers with the documentation it
// inherited from the old base, and verify must catch it. (A module of its own: the mock replaces
// the fix for the whole file.)
vi.mock('../documentation-cache', () => ({ installDocumentationFreshness: () => undefined }));

let directory: string;
const services: SemanticServiceImpl[] = [];
const at = (path: string) => join(directory, path);
const write = (path: string, text: string) => writeFileSync(at(path), text);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function snapshot(): DiscoverySnapshot {
  const common = {
    source: { path: at('entry.ts') },
    title: 'Reference',
    route: 'api',
    absoluteRoute: 'docs/api',
    breadcrumbs: ['Reference'],
    runtimeImport: { source: at('entry.ts'), exportName: 'default' },
    dependencies: [],
  };
  return {
    configuration: {
      projectId: 'site',
      workspaceRoot: directory,
      docsRoots: [directory],
      tsConfig: at('tsconfig.json'),
      outputRoot: at('output'),
      cacheRoot: at('cache'),
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
        scopes: [
          { id: 'public', name: 'Public', route: 'public', include: ['public*.ts'], exclude: [] },
        ],
      } as ApiDescriptor,
    ],
    globalKeywords: [],
    remoteKeywords: [],
  };
}

beforeEach(async () => {
  directory = hostPath(realpathSync(mkdtempSync(join(tmpdir(), 'semantic-verify-'))));
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true, types: [] },
      include: ['*.ts'],
    }),
  );
  write('entry.ts', 'const Page = {}; export default Page;');
  write('base.ts', 'export class Base {\n  /** Base value. */\n  value = 1;\n}');
  write(
    'public.ts',
    "import { Base } from './base';\n/** First. */\nexport class First extends Base {\n  override value = 2;\n}",
  );
  await pause(120);
});
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose();
  rmSync(directory, { recursive: true, force: true });
});

async function synchronize(mode: IncrementalProgramMode, previous?: RetainedSemanticState) {
  const service = createSemanticService({
    dependencyMode: 'scope-reference',
    incrementalProgram: mode,
  });
  services.push(service);
  const result = await service.synchronize(
    {
      generation: 1,
      discovery: snapshot(),
      changes: previous ? [{ kind: 'update', path: at('base.ts') }] : [],
      retention: previous ? { previous } : {},
    },
    new AbortController().signal,
  );
  return { service, result, program: service.retain() as RetainedProgram | undefined };
}

test('verify catches documentation a reused symbol cached for the old program', async () => {
  const first = await synchronize('on');
  // The inherited documentation is computed (and cached on the member symbol) before the patch.
  expect(JSON.stringify(programFacts(first.program!.project))).toContain('Base value.');
  write('base.ts', 'export class Base {\n  /** Edited value. */\n  value = 1;\n}');
  await pause(120);
  const verified = await synchronize('verify', first.program);
  expect(verified.service.synchronization()).toEqual({
    path: 'full',
    reason: `patch refused: verification: ${at('public.ts')}#First.value docs differs`,
  });
  expect(verified.result.diagnostics).toEqual([
    expect.objectContaining({ code: SEMANTIC_PATCH_MISMATCH, severity: 'warning' }),
  ]);
  // The replacement is the cold synchronization, with the new documentation.
  expect(JSON.stringify(programFacts(verified.program!.project))).toContain('Edited value.');
});

test('the first differing fact is named', () => {
  expect(firstFactDifference([['a', '1']], [['a', '1']])).toBeUndefined();
  expect(firstFactDifference([['a', '1']], [['a', '2']])).toBe('a differs');
  expect(firstFactDifference([['a', '1']], [['b', '1']])).toBe('fact 0 is a, cold b');
  expect(firstFactDifference([], [['b', '1']])).toBe('fact 0 is (none), cold b');
});
