import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertGeneratorMatchesSource, generatorRootFromEnv } from './prepare-expected-runtime.mjs';

// The C production acceptance, as a product test: the committed apps/ng-doc Vite configuration
// (apps/ng-doc/vite.config.mjs), built, server-built and prerendered by the product pipeline
// (buildNgDocViteApplication, which the vite-application builder and `ng-doc prerender` run).
// It needs an explicit evidence directory so that it never writes into tracked evidence.
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
assert.ok(process.env.NGDOC_PRODUCTION_C_EVIDENCE, 'NGDOC_PRODUCTION_C_EVIDENCE is required');
const evidence = path.resolve(process.env.NGDOC_PRODUCTION_C_EVIDENCE);
const generatorRoot = generatorRootFromEnv();
// The committed configuration loads the plugins from dist/libs/builder/generator; the pipeline
// under test must be that same build (use a private copy of the repository for a private build).
assert.equal(
  realpathSync(generatorRoot),
  realpathSync(path.join(root, 'dist/libs/builder/generator')),
  'NGDOC_PRODUCTION_C_GENERATOR must be the dist/libs/builder/generator the committed Vite configuration loads',
);
// Fail in seconds, before any build, when the generator was not built from these sources.
const provenance = await assertGeneratorMatchesSource(generatorRoot);
await mkdir(evidence, { recursive: true });
await mkdir(path.join(root, 'tmp'), { recursive: true });
const fixture = await mkdtemp(path.join(root, 'tmp/ngdoc-production-c-'));
const base = '/preview/';
const resultName = 'build-results.json';
const generated = path.join(fixture, 'generated');
const require = createRequire(import.meta.url);
const summary = {
  fixture,
  checks: [],
  errors: [],
  timings: {},
  tuple: {
    node: process.version,
    vite: require('vite/package.json').version,
    analog: require('@analogjs/vite-plugin-angular/package.json').version,
    angular: require('@angular/core/package.json').version,
  },
  provenance,
};
const timed = async (name, step) => {
  const started = performance.now();
  try {
    return await step();
  } finally {
    summary.timings[name] = Math.round(performance.now() - started);
  }
};
try {
  const [{ buildNgDocViteApplication }, { ngDocSiteGenerator }] = await Promise.all([
    import(pathToFileURL(path.join(generatorRoot, 'vite/index.js')).href),
    import(pathToFileURL(path.join(root, 'apps/ng-doc/vite.config.mjs')).href),
  ]);
  const put = async (file, value) => {
    const target = path.join(fixture, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value);
    return target;
  };
  // The fixture adds a never-opened probe page, and its own output, cache and base. `paths`
  // replaces the inherited mappings as a whole, so it keeps the site's and replaces the generated one.
  const sitePaths = JSON.parse(
    await readFile(path.join(root, 'apps/ng-doc/tsconfig.vite.json'), 'utf8'),
  ).compilerOptions.paths;
  const tsconfig = await put(
    'tsconfig.json',
    JSON.stringify(
      {
        extends: path.join(root, 'apps/ng-doc/tsconfig.vite.json'),
        compilerOptions: {
          paths: { ...sitePaths, '@ng-doc/generated': [path.join(generated, 'index.ts')] },
        },
      },
      null,
      2,
    ),
  );
  await put(
    'extra-docs/ng-doc.page.ts',
    `const page={title:'Unopened Probe',mdFile:'./index.md',route:'unopened-probe'};export default page;`,
  );
  await put('extra-docs/index.md', `{% include './missing-include.md' %}`);
  const config = await put(
    'ng-doc.config.ts',
    `import config from ${JSON.stringify(path.join(root, 'apps/ng-doc/ng-doc.config.ts'))};\nconst result = {...config, docsPath:[...(Array.isArray(config.docsPath)?config.docsPath:[config.docsPath]),${JSON.stringify(path.join(fixture, 'extra-docs'))}], outDir: undefined, cache: true}; export default result;\n`,
  );
  const generatorOptions = ngDocSiteGenerator({
    configFile: config,
    tsConfig: tsconfig,
    outputRoot: generated,
    cacheRoot: path.join(fixture, 'cache'),
  });
  const viteConfig = await put(
    'vite.config.mjs',
    `import { ngDocSiteConfig } from ${JSON.stringify(pathToFileURL(path.join(root, 'apps/ng-doc/vite.config.mjs')).href)};
export default ({ mode }) => ngDocSiteConfig({ mode, base: ${JSON.stringify(base)}, tsconfig: ${JSON.stringify(tsconfig)}, generator: ${JSON.stringify(generatorOptions)}, cacheDir: ${JSON.stringify(path.join(fixture, 'vite-cache'))} });
`,
  );
  const pipeline = () =>
    buildNgDocViteApplication({
      configFile: viteConfig,
      outputPath: fixture,
      log: (line) => console.log(`[production-c] ${line}`),
    });

  let rejected;
  try {
    await timed('rejected-build', pipeline);
  } catch (error) {
    rejected = error;
  }
  assert.ok(rejected, 'Production must reject the never-opened broken page');
  assert.match(String(rejected), /missing-include/);
  summary.checks.push({
    name: 'actual-vite-production-rejects-never-opened-page',
    error: String(rejected),
  });
  await put(
    'extra-docs/missing-include.md',
    '# Production probe repaired\nThis never-opened page is fully rendered in production.',
  );
  const built = await timed('build-server-prerender', pipeline);
  assert.equal(built.server, path.join(fixture, 'server/server.mjs'));
  assert.ok(existsSync(built.server), 'The server bundle exists');
  assert.equal(built.prerendered.shell, 'index.csr.html');
  assert.deepEqual(
    built.prerendered.errors,
    [],
    'The application logged errors while prerendering',
  );
  summary.checks.push({
    name: 'production-browser-server-build-and-prerender',
    routes: built.prerendered.routes.length,
    excluded: built.prerendered.excluded,
  });
  const before = await readFile(path.join(generated, 'assets/indexes.json'));
  const keywordsBefore = await readFile(path.join(generated, 'assets/keywords.json'));
  assert.deepEqual(
    await readFile(path.join(fixture, 'browser/assets/ng-doc/indexes.json')),
    before,
  );
  assert.deepEqual(
    await readFile(path.join(fixture, 'browser/assets/ng-doc/keywords.json')),
    keywordsBefore,
  );
  summary.checks.push({ name: 'generated-assets-emitted' });

  const { createGeneratorBuildSession } = await import(
    pathToFileURL(path.join(generatorRoot, 'bootstrap/index.js')).href
  );
  const session = createGeneratorBuildSession(generatorOptions);
  try {
    const result = await session.buildOnce({ mode: 'production' });
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.equal(result.snapshot.contentIndex, undefined, 'Snapshots carry no content index');
    for (const output of result.manifest.files)
      assert.equal(
        createHash('sha256')
          .update(await readFile(path.join(generated, output.path)))
          .digest('hex'),
        output.digest,
        output.path,
      );
    assert.ok(
      result.snapshot.artifacts.every((a) => !('deferredContentIds' in a)),
      'Artifacts carry no deferred content IDs',
    );
    const descriptors = result.snapshot.artifacts.flatMap((a) => a.contentDescriptors ?? []);
    const content = result.snapshot.artifacts
      .flatMap((a) => a.content)
      .filter((c) => c.ir.role !== 'demo-assets');
    assert.equal(descriptors.length, content.length);
    const ids = descriptors.map((d) => d.id).sort();
    assert.equal(new Set(ids).size, ids.length, 'Production descriptors must be unique');
    assert.deepEqual(
      content.map((c) => c.ir.id).sort(),
      ids,
      'Every descriptor must have its own materialized content',
    );
    assert.deepEqual(
      await readFile(path.join(generated, 'assets/indexes.json')),
      before,
      'Warm eager search parity',
    );
    assert.deepEqual(
      await readFile(path.join(generated, 'assets/keywords.json')),
      keywordsBefore,
      'Warm eager keyword parity',
    );
    await writeFile(
      path.join(evidence, 'generator-inventory.json'),
      JSON.stringify(
        {
          revision: result.snapshot.revision,
          routes: result.snapshot.artifacts.flatMap((a) => a.routes),
          content: content.map((c) => ({
            id: c.ir.id,
            route: c.ir.absoluteRoute,
            role: c.ir.role,
          })),
          descriptors: descriptors.map((d) => ({
            id: d.id,
            absoluteRoute: d.absoluteRoute,
            role: d.role,
          })),
          api: result.snapshot.artifacts.flatMap((a) => a.apiList),
        },
        null,
        2,
      ),
    );
    summary.checks.push({
      name: 'complete-production-materialization-and-warm-parity',
      descriptors: descriptors.length,
    });
  } finally {
    await session.dispose();
  }
  const { discoverExpectedRoutes } = await import('./expected-inventory.mjs');
  const { prepareExpectedRuntime } = await import('./prepare-expected-runtime.mjs');
  const expectedRoot = await prepareExpectedRuntime(path.join(fixture, 'expected-runtime'), {
    generatorRoot,
  });
  const expected = await discoverExpectedRoutes(expectedRoot, generatorOptions);
  await writeFile(
    path.join(evidence, 'expected-inventory.json'),
    JSON.stringify(expected, null, 2),
  );
  await writeFile(path.join(evidence, resultName), JSON.stringify(summary, null, 2));
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('./audit.mjs', import.meta.url)),
      fixture,
      evidence,
      base,
      JSON.stringify(generatorOptions),
    ],
    { stdio: 'inherit', env: process.env },
  );
  const [code, signal] = await once(child, 'close');
  assert.equal(code, 0, 'Fresh production audit failed: ' + signal);
  summary.audit = JSON.parse(await readFile(path.join(evidence, 'audit-results.json'), 'utf8'));
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  if (process.env.NGDOC_PRODUCTION_C_KEEP_FIXTURE !== '1')
    await rm(fixture, { recursive: true, force: true });
  summary.fixtureRemoved = !existsSync(fixture);
  await writeFile(path.join(evidence, resultName), JSON.stringify(summary, null, 2));
}
