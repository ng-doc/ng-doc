import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverExpectedRoutes } from './expected-inventory.mjs';
import { generatorRootFromEnv, prepareExpectedRuntime } from './prepare-expected-runtime.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const evidence = process.env.NGDOC_EXPECTED_INVENTORY_EVIDENCE;
let temporary;
let runtime;
const observations = [];
const put = async (base, name, text) => {
  const file = path.join(base, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
};

before(async () => {
  temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'ngdoc-expected-inventory-')));
  runtime = await prepareExpectedRuntime(path.join(temporary, 'runtime'));
});
after(async () => {
  try {
    if (evidence && runtime) {
      await mkdir(evidence, { recursive: true });
      await cp(
        path.join(runtime, 'provenance.json'),
        path.join(evidence, 'runtime-provenance.json'),
      );
      await cp(path.join(runtime, 'metafile.json'), path.join(evidence, 'runtime-metafile.json'));
      await writeFile(
        path.join(evidence, 'observations.json'),
        JSON.stringify(observations, null, 2),
      );
    }
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
});

async function fixture(name) {
  const base = path.join(temporary, name);
  await put(
    base,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        skipLibCheck: true,
      },
      include: ['docs/**/*.ts', 'src/**/*.ts'],
    }),
  );
  await put(
    base,
    'ng-doc.config.ts',
    `export default { docsPath: 'docs', routePrefix: 'manual', cache: false };`,
  );
  await put(
    base,
    'docs/ng-doc.category.ts',
    `const Parent = {title:'Nested parent', route:'parent'}; export default Parent;`,
  );
  await put(
    base,
    'docs/child/ng-doc.category.ts',
    `import parent from '../ng-doc.category'; const Child = {title:'Child', route:'child', category:parent}; export default Child;`,
  );
  await put(
    base,
    'docs/child/guide/ng-doc.page.ts',
    `import category from '../ng-doc.category'; const Guide = {title:'Guide', route:'guide', category, mdFile:['./index.md','./tab.md']}; export default Guide;`,
  );
  await put(
    base,
    'docs/child/guide/index.md',
    '# Initial body\n{% include "unopened-missing.nunj" %}',
  );
  await put(
    base,
    'docs/child/guide/tab.md',
    '---\nroute: second-tab\ntitle: "Special <title> & more"\n---\n# Tab',
  );
  await put(
    base,
    'docs/reference/ng-doc.api.ts',
    `import category from '../ng-doc.category'; const Api = {title:'API', route:'reference', category, scopes:[{name:'Public',route:'public',include:['src/*.ts'],exclude:['src/excluded.ts']}]}; export default Api;`,
  );
  await put(
    base,
    'src/public.ts',
    `export interface InitialApi { label: string; }\n/** @internal */\nexport interface InternalApi {}\nexport namespace UnsupportedNamespace { export const item = 1; }`,
  );
  await put(base, 'src/excluded.ts', 'export interface ExcludedByGlob {}');
  return {
    base,
    options: {
      projectId: 'expected-fixture',
      workspaceRoot: base,
      configFile: path.join(base, 'ng-doc.config.ts'),
      defaults: {
        docsRoot: path.join(base, 'docs'),
        tsConfig: path.join(base, 'tsconfig.json'),
        outputRoot: path.join(base, 'output'),
        cacheRoot: path.join(base, 'cache'),
      },
      templateRoot: path.join(generatorRootFromEnv(), 'templates'),
      compilerVersion: 'test',
      toolchainDigest: 'test',
    },
  };
}

test(
  'real discovery and semantic inventory includes nested guides/front matter/API and no heavy rendering',
  { timeout: 60000 },
  async () => {
    const { base, options } = await fixture('initial');
    const result = await discoverExpectedRoutes(runtime, options);
    assert.deepEqual(
      result.routes.map((item) => item.path),
      [
        '/manual/parent/child/guide',
        '/manual/parent/child/guide/second-tab',
        '/manual/parent/reference',
        '/manual/reference/interfaces/public/InitialApi',
      ],
    );
    assert.equal(
      result.routes.find((item) => item.kind === 'guide').defaultTab.source,
      path.join(base, 'docs/child/guide/index.md'),
    );
    assert.equal(
      result.routes.find((item) => item.kind === 'guide-tab').title,
      'Special <title> & more',
    );
    assert.equal(
      result.routes.some((item) =>
        /InternalApi|ExcludedByGlob|UnsupportedNamespace/.test(item.path),
      ),
      false,
    );
    assert.equal(result.scopes[0].declarationIds.length, 1);
    assert.ok(result.diagnostics.some((item) => item.code === 'SEMANTIC_DECLARATION_KIND'));
    assert.deepEqual(
      result.excluded.map((item) => [item.kind, item.path]),
      [
        ['category', '/manual/parent'],
        ['category', '/manual/parent/child'],
      ],
    );
    await assert.rejects(access(options.defaults.outputRoot), { code: 'ENOENT' });
    await assert.rejects(access(options.defaults.cacheRoot), { code: 'ENOENT' });
    observations.push({
      case: 'initial',
      result,
      missingNunjucksIncludeWasNotRendered: true,
      outputAbsent: true,
    });
  },
);

test(
  'new TS exports, new guide, and edited tab front matter change the expected list without generated outputs',
  { timeout: 60000 },
  async () => {
    const { base, options } = await fixture('changes');
    const before = await discoverExpectedRoutes(runtime, options);
    await put(base, 'src/added.ts', 'export class AddedApi { value = 1; }');
    await put(
      base,
      'docs/added/ng-doc.page.ts',
      `const Added = {title:'Added guide', route:'added', mdFile:'./index.md'}; export default Added;`,
    );
    await put(base, 'docs/added/index.md', '# Added');
    await put(base, 'docs/child/guide/tab.md', '---\nroute: renamed-tab\n---\n# Tab');
    const after = await discoverExpectedRoutes(runtime, options);
    assert.equal(after.routes.length, before.routes.length + 2);
    assert.ok(
      after.routes.some((item) => item.path === '/manual/reference/classes/public/AddedApi'),
    );
    assert.ok(after.routes.some((item) => item.path === '/manual/added'));
    assert.ok(after.routes.some((item) => item.path === '/manual/parent/child/guide/renamed-tab'));
    assert.equal(
      after.routes.some((item) => item.path.endsWith('/second-tab')),
      false,
    );
    const initial = before.routes.find((item) => item.title === 'InitialApi');
    assert.equal(
      after.routes.find((item) => item.title === 'InitialApi').identity,
      initial.identity,
    );
    await assert.rejects(access(options.defaults.outputRoot), { code: 'ENOENT' });
    observations.push({ case: 'additions', before, after, outputAbsent: true });
  },
);

test(
  'missing Markdown and invalid front matter reject; repaired repeat succeeds after disposal',
  { timeout: 60000 },
  async () => {
    const { base, options } = await fixture('missing');
    await rm(path.join(base, 'docs/child/guide/tab.md'));
    await assert.rejects(discoverExpectedRoutes(runtime, options), /CONTENT_READ.*tab\.md/);
    await put(base, 'docs/child/guide/tab.md', '---\nroute: [invalid\n---\n# Tab');
    await assert.rejects(discoverExpectedRoutes(runtime, options), /CONTENT_FRONTMATTER/);
    await put(base, 'docs/child/guide/tab.md', '---\nroute: repaired\n---\n# Tab');
    const repaired = await discoverExpectedRoutes(runtime, options);
    assert.ok(repaired.routes.some((item) => item.path.endsWith('/repaired')));
    observations.push({
      case: 'missing-and-malformed',
      expectedFailures: ['CONTENT_READ', 'CONTENT_FRONTMATTER'],
      repaired,
    });
  },
);

test(
  'invalid discovery and duplicate concrete tabs fail instead of shrinking/deduplicating expected routes',
  { timeout: 60000 },
  async () => {
    const { base, options } = await fixture('invalid');
    await put(base, 'docs/child/guide/tab.md', '# duplicate default tab');
    await assert.rejects(discoverExpectedRoutes(runtime, options), /route collision.*default tabs/);
    await put(base, 'ng-doc.config.ts', 'export default { broken syntax');
    await assert.rejects(
      discoverExpectedRoutes(runtime, options),
      /Expected inventory discovery failed/,
    );
    observations.push({
      case: 'invalid',
      expectedFailures: ['duplicate-default-route', 'discovery-syntax'],
    });
  },
);

test('prepared runtime has input hashes, excludes compiler/outputs, and refuses overwrite', async () => {
  const provenance = JSON.parse(await readFile(path.join(runtime, 'provenance.json'), 'utf8'));
  assert.match(provenance.sourceDigest, /^[a-f0-9]{64}$/);
  assert.ok(Object.keys(provenance.inputs).some((item) => item.endsWith('discovery/index.ts')));
  assert.ok(
    Object.keys(provenance.inputs).some((item) => item.endsWith('semantic/semantic-service.ts')),
  );
  assert.equal(
    Object.keys(provenance.inputs).some((item) => /generator\/(compiler|outputs)\//.test(item)),
    false,
  );
  await assert.rejects(prepareExpectedRuntime(runtime), { code: 'EEXIST' });
  observations.push({
    case: 'provenance',
    sourceDigest: provenance.sourceDigest,
    inputs: Object.keys(provenance.inputs).length,
  });
});
