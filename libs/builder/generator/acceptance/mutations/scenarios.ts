/** Real compiler/worker/cache/committer acceptance. Only the session event/delay seam is injected. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createArtifactCache, createOutputCommitter } from '../../artifacts';
import type {
  ArtifactSnapshot,
  CompilationResult,
  CompilationService,
  FileChange,
  JsonValue,
  PageArtifact,
} from '../../contracts';
import { createBuildSession } from '../../session/build-session';
import { createWorkerCompilationService } from '../../worker';

const [scenario, stage, root, runtimeRoot, repository, reportPath] = process.argv.slice(2);
const checks: Array<{ code: string; passed: boolean; detail?: unknown }> = [];
const facts: Record<string, unknown> = {};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const signal = () => new AbortController().signal;
const check = (code: string, passed: boolean, detail?: unknown) =>
  checks.push({ code, passed, ...(detail === undefined ? {} : { detail }) });
const write = async (file: string, value: string) => {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
  return target;
};
const snapshotFile = path.join(root, 'cold.json');
const outputRoot = path.join(root, 'out');
const manifestFile = path.join(outputRoot, '.ng-doc-output-manifest.json');
const shared = path.join(root, 'docs/guide/shared.nunj');
const initial = 'Initial external text with `Actual`.\n';
const changed = 'Changed external text with `Actual`.\n';
function service(): CompilationService {
  return createWorkerCompilationService({
    moduleUrl: pathToFileURL(path.join(runtimeRoot, 'compiler.mjs')),
    workerEntryUrl: pathToFileURL(path.join(runtimeRoot, 'worker/entry.js')),
    startupTimeoutMs: 15_000,
    compileTimeoutMs: 30_000,
    factoryOptions: {
      projectId: 'mutation',
      workspaceRoot: root,
      configFile: path.join(root, 'ng-doc.config.ts'),
      defaults: {
        docsRoot: path.join(root, 'docs'),
        tsConfig: path.join(root, 'tsconfig.json'),
        outputRoot,
        cacheRoot: path.join(root, 'cache'),
      },
      compilerVersion: 't12-mutation-1',
      toolchainDigest: 'node24-real-ts6',
      templateRoot: path.join(repository, 'libs/builder/templates'),
    } as JsonValue,
  });
}
async function compile(
  generation: number = 1,
  changes: FileChange[] = [],
): Promise<CompilationResult> {
  const compiler = service();
  try {
    return await compiler.compile({ generation, mode: 'production', changes }, signal());
  } finally {
    await compiler.dispose();
  }
}
function successful(result: CompilationResult): ArtifactSnapshot {
  assert.deepEqual(
    result.diagnostics.filter((d) => d.severity === 'error'),
    [],
    'real compiler fixture must compile',
  );
  assert.ok(result.candidate, 'real compiler must return a candidate');
  return result.candidate;
}
const html = (snapshot: ArtifactSnapshot) =>
  snapshot.artifacts
    .flatMap((a) => a.content)
    .map((c) => c.html)
    .join('\n');
const outputs = (snapshot: ArtifactSnapshot) =>
  Object.fromEntries(
    snapshot.artifacts
      .flatMap((a) => a.outputs)
      .map((o) => [o.path, o.digest])
      .sort(),
  );
const records = (snapshot: ArtifactSnapshot) => ({
  keywords: [...snapshot.globalKeywords, ...snapshot.artifacts.flatMap((a) => a.exportedKeywords)],
  search: snapshot.artifacts.flatMap((a) => a.searchRecords),
  routes: snapshot.artifacts.flatMap((a) => a.routes),
  api: snapshot.artifacts.flatMap((a) => a.apiList),
});
async function product(): Promise<Record<string, string>> {
  const inventory: Record<string, string> = {};
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else inventory[path.relative(outputRoot, file)] = hash(await readFile(file, 'utf8'));
    }
  }
  await walk(outputRoot);
  return Object.fromEntries(Object.entries(inventory).sort());
}
async function publish(snapshot: ArtifactSnapshot, generation: number, previous?: any) {
  const committer = createOutputCommitter({ outputRoot });
  try {
    const result = await committer.commit(
      { generation, candidate: snapshot, ...(previous ? { previous } : {}) },
      { isCurrent: () => true },
      signal(),
    );
    assert.equal(result.status, 'committed', JSON.stringify(result));
    if (result.status !== 'committed') throw new Error('unreachable');
    return result.manifest;
  } finally {
    await committer.dispose();
  }
}
async function fixture() {
  await write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/**/*.ts'],
    }),
  );
  await write(
    'ng-doc.config.ts',
    `import { appendFileSync } from 'node:fs'; import process from 'node:process'; appendFileSync(${JSON.stringify(path.join(root, 'worker-pids.log'))}, process.pid + '\\n'); export default { docsPath: 'docs', cache: true };`,
  );
  await write(
    'docs/ng-doc.api.ts',
    `const api = { title:'API', scopes:[{name:'Public',route:'public',include:['docs/api*.ts']}] }; export default api;`,
  );
  await write(
    'docs/api.ts',
    '/** Actual declaration prose. */ export class Actual { /** Member prose. */ value = 1; }\n/** Unvisited extra API. */ export class UnvisitedApi {}',
  );
  await write(
    'docs/guide/ng-doc.page.ts',
    `const page={title:'Guide',route:'guide',mdFile:['./first.md.nunj','./second.md.nunj']};export default page;`,
  );
  await write(
    'docs/guide/first.md.nunj',
    '---\ntitle: First\nroute: first\nkeyword: FirstGuide\n---\n# First heading\n{% include "./shared.nunj" %}',
  );
  await write(
    'docs/guide/second.md.nunj',
    '---\ntitle: Second\nroute: second\nkeyword: SecondGuide\n---\n# Second heading\n{% include "./shared.nunj" %}',
  );
  await write('docs/guide/shared.nunj', initial);
}
function owned(owner: string, text: string): ArtifactSnapshot {
  const artifact: PageArtifact = {
    id: owner,
    identity: { projectId: 'mutation', entryId: owner, role: 'content' },
    revision: owner,
    fingerprint: {
      schemaVersion: 4,
      compilerVersion: 'test',
      toolchainDigest: 'test',
      configurationDigest: 'test',
      inputDigest: owner,
      keywordDigest: 'test',
    },
    dependencies: [],
    content: [],
    exportedKeywords: [{ key: owner, title: owner, path: owner }],
    usedKeywords: [],
    searchRecords: [
      {
        breadcrumbs: [owner],
        pageType: 'guide',
        title: owner,
        section: owner,
        route: owner,
        fragment: owner,
        content: text,
      },
    ],
    routes: [{ id: owner, path: owner, title: owner, modulePath: 'shared/page.ts' }],
    apiList: [],
    diagnostics: [],
    outputs: [
      {
        path: 'shared/page.ts',
        role: 'content',
        encoding: 'utf8',
        content: text,
        digest: hash(text),
      },
      {
        path: 'assets/indexes.json',
        role: 'asset',
        encoding: 'utf8',
        content: JSON.stringify({ owner, text }),
        digest: hash(JSON.stringify({ owner, text })),
      },
    ],
  };
  return {
    projectId: 'mutation',
    revision: owner,
    artifacts: [artifact],
    globalKeywords: artifact.exportedKeywords,
    remoteKeywords: [],
  };
}
async function ownership() {
  for (const identical of [true, false]) {
    const subroot = path.join(root, identical ? 'identical' : 'different');
    const bytes = identical ? 'candidate text' : 'USER OWNED BYTES';
    await mkdir(path.join(subroot, 'shared'), { recursive: true });
    await writeFile(path.join(subroot, 'shared/page.ts'), bytes);
    const committer = createOutputCommitter({ outputRoot: subroot });
    try {
      const result = await committer.commit(
        { generation: 1, candidate: owned('intruder', 'candidate text') },
        { isCurrent: () => true },
        signal(),
      );
      check(
        'M_OWN_REJECT_UNOWNED',
        result.status === 'failed' &&
          result.diagnostics.some((d) => d.code === 'OUTPUT_UNOWNED_COLLISION'),
        { identical, status: result.status },
      );
      check(
        'M_OWN_PRESERVE_USER_BYTES',
        (await readFile(path.join(subroot, 'shared/page.ts'), 'utf8')) === bytes,
        { identical },
      );
      check(
        'M_OWN_NO_MANIFEST',
        !(await readFile(path.join(subroot, '.ng-doc-output-manifest.json'), 'utf8').catch(
          () => '',
        )),
        { identical },
      );
    } finally {
      await committer.dispose();
    }
  }
  const old = await publish(owned('old-owner', 'OLD'), 1);
  const current = await publish(owned('new-owner', 'NEW'), 2, old);
  const before = await product();
  const cleanup = createOutputCommitter({ outputRoot });
  try {
    const result = await cleanup.commit(
      {
        generation: 3,
        candidate: { ...owned('old-owner', 'OLD'), artifacts: [], revision: 'old-cleanup' },
        previous: old,
      },
      { isCurrent: () => true },
      signal(),
    );
    check(
      'M_OWN_STALE_CLEANUP_REJECTED',
      result.status === 'failed' &&
        result.diagnostics.some((d) => d.code === 'OUTPUT_MANIFEST_STALE'),
    );
    check(
      'M_OWN_NEW_OWNER_PRODUCT_PRESERVED',
      JSON.stringify(await product()) === JSON.stringify(before),
    );
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    check(
      'M_OWN_NEW_OWNER_METADATA',
      manifest.files.every((f: any) => f.ownerId === 'new-owner') &&
        manifest.revision === current.revision,
    );
    facts.handoff = { before, after: await product(), manifest };
  } finally {
    await cleanup.dispose();
  }
}
async function cacheAndDependency() {
  if (stage === 'seed') {
    await fixture();
    const cold = successful(await compile());
    await writeFile(snapshotFile, JSON.stringify(cold));
    await publish(cold, 1);
    check(
      'SEED_TWO_CONSUMERS',
      cold.artifacts
        .flatMap((a) => a.content)
        .filter((c) => c.ir.role === 'guide-tab' && c.html.includes('Initial external text'))
        .length === 2,
    );
    facts.cold = { outputs: outputs(cold), records: records(cold) };
    return;
  }
  const cold = JSON.parse(await readFile(snapshotFile, 'utf8')) as ArtifactSnapshot;
  if (scenario === 'M-CACHE') {
    const cache = createArtifactCache(path.join(root, 'cache'));
    const guide = cold.artifacts.find((a) => a.content.some((c) => c.ir.role === 'guide-tab'))!;
    const restored = await cache.read({ identity: guide.identity, fingerprint: guide.fingerprint });
    assert.equal(restored.status, 'hit', 'setup must exercise a real cache hit');
    if (restored.status === 'hit') {
      check(
        'M_CACHE_RESTORED_BYTES',
        JSON.stringify(restored.artifact.outputs) === JSON.stringify(guide.outputs),
      );
      check(
        'M_CACHE_COMPLETE_RECORD_RESTORE',
        JSON.stringify(restored.artifact) === JSON.stringify(guide),
      );
    }
  }
  const warmResult = await compile();
  const warm = successful(warmResult);
  check('WARM_NO_REBUILD', warmResult.whyRebuilt.length === 0, warmResult.whyRebuilt);
  check('M_CACHE_WARM_RECORDS', JSON.stringify(records(warm)) === JSON.stringify(records(cold)));
  check(
    'M_CACHE_WARM_OUTPUT_BYTES',
    JSON.stringify(outputs(warm)) === JSON.stringify(outputs(cold)),
  );
  await writeFile(shared, changed);
  const updated = successful(await compile(2, [{ kind: 'update', path: shared }]));
  const consumers = updated.artifacts
    .flatMap((a) => a.content)
    .filter((c) => c.ir.role === 'guide-tab');
  check(
    'M_DEP_EVERY_CONSUMER_HTML',
    consumers.length === 2 &&
      consumers.every(
        (c) =>
          c.html.includes('Changed external text') &&
          !c.html.includes('Initial external text') &&
          c.html.includes('href="api/classes/public/Actual"'),
      ),
    consumers.map((c) => ({ title: c.ir.title, html: c.html })),
  );
  check(
    'M_DEP_SEARCH_AND_LINK_METADATA',
    consumers.every((c) =>
      c.searchRecords.some((r) => r.content.includes('Changed external text')),
    ) && updated.artifacts.some((a) => a.exportedKeywords.some((k) => k.key === 'Actual')),
    records(updated),
  );
  const previous = JSON.parse(await readFile(manifestFile, 'utf8'));
  await publish(updated, 2, previous);
  const generated = await Promise.all(
    updated.artifacts
      .flatMap((a) => a.outputs)
      .filter((o) => o.role === 'content')
      .map((o) => readFile(path.join(outputRoot, o.path), 'utf8')),
  );
  check(
    'M_DEP_COMMITTED_PRODUCT_BYTES',
    generated.some((s) => s.includes('Changed external text')) &&
      !generated.some((s) => s.includes('Initial external text')),
  );
  facts.warm = { whyRebuilt: warmResult.whyRebuilt, records: records(warm) };
  facts.final = { records: records(updated), product: await product() };
  const pids = (await readFile(path.join(root, 'worker-pids.log'), 'utf8')).trim().split('\n');
  check('FRESH_DISPOSABLE_WORKERS', new Set(pids).size === 3, { pids });
}
async function production() {
  await fixture();
  const valid = successful(await compile());
  check(
    'M_PROD_ENUMERATES_UNREQUESTED_API',
    valid.artifacts.filter((a) => a.identity.declarationId).length === 2,
    records(valid),
  );
  const previous = await publish(valid, 1);
  const before = await product();
  await write(
    'docs/unvisited/ng-doc.page.ts',
    `const page={title:'Unvisited broken page',route:'unvisited',mdFile:'./broken.md.nunj'};export default page;`,
  );
  await write('docs/unvisited/broken.md.nunj', '# Never requested\n{% include "./missing.nunj" %}');
  const compiler = service();
  const committer = createOutputCommitter({ outputRoot });
  const session = createBuildSession({ compiler, committer });
  try {
    const result = await session.buildOnce({ mode: 'production' });
    check('M_PROD_UNVISITED_BROKEN_PAGE_FAILS', result.status === 'failure', {
      status: result.status,
      diagnostics: result.diagnostics,
    });
    check('M_PROD_LAST_GOOD_PRODUCT', JSON.stringify(await product()) === JSON.stringify(before));
    check(
      'M_PROD_LAST_GOOD_MANIFEST',
      JSON.parse(await readFile(manifestFile, 'utf8')).revision === previous.revision,
    );
    facts.production = {
      result: result.status,
      diagnostics: result.diagnostics,
      before,
      after: await product(),
    };
  } finally {
    await session.dispose();
  }
}
/** Owner id → (output path → content); an artifact's revision digests its outputs. */
function site(files: Record<string, Record<string, string>>, revision: string): ArtifactSnapshot {
  const artifacts = Object.entries(files).map(([id, outputs]) => {
    const [artifact] = owned(id, '').artifacts;
    const items = Object.entries(outputs).map(([file, content]) => ({
      path: file,
      role: 'content' as const,
      encoding: 'utf8' as const,
      content,
      digest: hash(content),
    }));
    return {
      ...artifact,
      revision: hash(JSON.stringify(items)),
      exportedKeywords: [],
      searchRecords: [],
      routes: [],
      outputs: items,
    };
  });
  return { projectId: 'mutation', revision, artifacts, globalKeywords: [], remoteKeywords: [] };
}
function manifestOf(
  result: Awaited<ReturnType<ReturnType<typeof createOutputCommitter>['commit']>>,
) {
  assert.equal(result.status, 'committed', JSON.stringify(result));
  if (result.status !== 'committed') throw new Error('unreachable');
  return result.manifest;
}
/**
 * A caller one publication behind the committer (a commit it did not adopt) passes the pair of
 * generation 1 while the disk holds generation 2. The committer must not take the delta path; the
 * full commit rejects the stale previous manifest.
 */
async function deltaBase() {
  const committer = createOutputCommitter({ outputRoot });
  try {
    const first = site({ a: { 'a/page.ts': 'A1' }, b: { 'b/page.ts': 'B1' } }, 'r1');
    const m1 = manifestOf(
      await committer.commit(
        { generation: 1, candidate: first },
        { isCurrent: () => true },
        signal(),
      ),
    );
    const second = site({ a: { 'a/page.ts': 'A2' }, b: { 'b/page.ts': 'B1' } }, 'r2');
    manifestOf(
      await committer.commit(
        { generation: 2, candidate: second, previous: m1, base: { snapshot: first, manifest: m1 } },
        { isCurrent: () => true },
        signal(),
      ),
    );
    const before = await product();
    const third = site({ a: { 'a/page.ts': 'A3' }, b: { 'b/page.ts': 'B1' } }, 'r3');
    const result = await committer.commit(
      { generation: 3, candidate: third, previous: m1, base: { snapshot: first, manifest: m1 } },
      { isCurrent: () => true },
      signal(),
    );
    check(
      'M_DELTA_BASE_IDENTITY',
      result.status === 'failed' &&
        result.diagnostics.some((d) => d.code === 'OUTPUT_MANIFEST_STALE'),
      { status: result.status, diagnostics: result.diagnostics },
    );
    check('M_DELTA_BASE_DISK', JSON.stringify(await product()) === JSON.stringify(before));
    facts.base = { before, after: await product(), result: result.status };
  } finally {
    await committer.dispose();
  }
}
/**
 * After a commit call that did not end `committed`, the committer trusts no publication, so the
 * next commit is full and repairs an unchanged output deleted meanwhile.
 */
async function deltaTrust() {
  const committer = createOutputCommitter({ outputRoot });
  try {
    const first = site({ a: { 'a/page.ts': 'A1' }, b: { 'b/page.ts': 'B1' } }, 'r1');
    const m1 = manifestOf(
      await committer.commit(
        { generation: 1, candidate: first },
        { isCurrent: () => true },
        signal(),
      ),
    );
    const base = { snapshot: first, manifest: m1 };
    const stale = await committer.commit(
      {
        generation: 2,
        candidate: site({ a: { 'a/page.ts': 'A2' }, b: { 'b/page.ts': 'B1' } }, 'r2'),
        previous: m1,
        base,
      },
      { isCurrent: () => false },
      signal(),
    );
    check('M_DELTA_STALE_OUTCOME', stale.status === 'stale', { status: stale.status });
    await rm(path.join(outputRoot, 'b/page.ts'));
    const third = site({ a: { 'a/page.ts': 'A3' }, b: { 'b/page.ts': 'B1' } }, 'r3');
    const result = await committer.commit(
      { generation: 3, candidate: third, previous: m1, base },
      { isCurrent: () => true },
      signal(),
    );
    const restored = await readFile(path.join(outputRoot, 'b/page.ts'), 'utf8').catch(
      () => undefined,
    );
    check(
      'M_DELTA_UNTRUSTED_AFTER_NONCOMMITTED',
      result.status === 'committed' && restored === 'B1',
      {
        status: result.status,
        restored,
      },
    );
    facts.trust = { result: result.status, product: await product() };
  } finally {
    await committer.dispose();
  }
}
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
async function staleCommit() {
  await fixture();
  const cold = successful(await compile());
  const previous = await publish(cold, 1);
  const before = await product();
  await writeFile(shared, changed);
  const updated = successful(await compile(2, [{ kind: 'update', path: shared }]));
  let current = true;
  const arrived = deferred(),
    release = deferred();
  const committer = createOutputCommitter({
    outputRoot,
    beforeMutation: async (operation) => {
      if (operation === 'publish-manifest') {
        arrived.resolve();
        await release.promise;
      }
    },
  });
  try {
    const pending = committer.commit(
      { generation: 2, candidate: updated, previous },
      { isCurrent: () => current },
      signal(),
    );
    await arrived.promise;
    current = false;
    release.resolve();
    const result = await pending;
    check('M_STALE_COMMIT_REJECTED', result.status === 'stale', { status: result.status });
    check(
      'M_STALE_REAL_PRODUCT_ROLLBACK',
      JSON.stringify(await product()) === JSON.stringify(before),
    );
    check(
      'M_STALE_MANIFEST_ROLLBACK',
      JSON.parse(await readFile(manifestFile, 'utf8')).revision === cold.revision,
    );
    facts.commit = { before, after: await product(), result: result.status };
  } finally {
    release.resolve();
    await committer.dispose();
  }
}
async function staleSession() {
  await fixture();
  const compiler = service();
  const committer = createOutputCommitter({ outputRoot });
  const compiled = deferred(),
    release = deferred();
  let delay = false;
  let delayedGeneration = -1;
  let emit!: (changes: FileChange[]) => void;
  const admissions: number[] = [];
  let finalResult: any;
  const latest = deferred();
  const session = createBuildSession(
    {
      compiler: {
        compile: async (request, abort) => {
          const value = await compiler.compile(request, abort);
          if (delay) {
            delay = false;
            delayedGeneration = request.generation;
            compiled.resolve();
            await release.promise;
          }
          return value;
        },
        dispose: () => compiler.dispose(),
      },
      committer: {
        commit: async (request, guard, abort) => {
          admissions.push(request.generation);
          return committer.commit(request, guard, abort);
        },
        dispose: () => committer.dispose(),
      },
    },
    { batchDelayMs: 1 },
  );
  let watch;
  try {
    watch = await session.watch(
      {
        subscribe: async (callback) => {
          emit = callback;
          return { dispose: async () => {} };
        },
      },
      (event) => {
        if (
          event.kind === 'result' &&
          event.result.status === 'success' &&
          html(event.result.snapshot).includes('Latest external text')
        ) {
          finalResult = event.result;
          latest.resolve();
        }
      },
    );
    assert.equal((await watch.initial).status, 'success');
    const before = await product();
    delay = true;
    await writeFile(shared, 'Stale external text with `Actual`.\n');
    emit([{ kind: 'update', path: shared }]);
    await compiled.promise;
    await writeFile(shared, 'Latest external text with `Actual`.\n');
    emit([{ kind: 'update', path: shared }]);
    release.resolve();
    await latest.promise;
    check('M_STALE_SESSION_NO_ADMISSION', !admissions.includes(delayedGeneration), {
      admissions,
      delayedGeneration,
    });
    check(
      'M_STALE_SESSION_LATEST_PRODUCT',
      html(finalResult.snapshot).includes('Latest external text') &&
        !html(finalResult.snapshot).includes('Stale external text'),
    );
    const disk = await Promise.all(
      finalResult.snapshot.artifacts
        .flatMap((a: PageArtifact) => a.outputs)
        .map((o: any) => readFile(path.join(outputRoot, o.path), 'utf8')),
    );
    check(
      'M_STALE_SESSION_DISK_BYTES',
      disk.some((s: string) => s.includes('Latest external text')) &&
        !disk.some((s: string) => s.includes('Stale external text')),
    );
    facts.session = {
      before,
      after: await product(),
      admissions,
      delayedGeneration,
      manifest: finalResult.manifest,
      records: records(finalResult.snapshot),
    };
  } finally {
    release.resolve();
    await watch?.dispose();
    await session.dispose();
  }
}
const timeout = setTimeout(() => {
  console.error('Scenario observation deadline exceeded');
  process.exit(3);
}, 60_000);
try {
  if (scenario === 'M-OWN') await ownership();
  else if (scenario === 'M-DEP' || scenario === 'M-CACHE') await cacheAndDependency();
  else if (scenario === 'M-PROD') await production();
  else if (scenario === 'M-STALE') await staleCommit();
  else if (scenario === 'M-STALE-SESSION') await staleSession();
  else if (scenario === 'M-DELTA-BASE') await deltaBase();
  else if (scenario === 'M-DELTA-TRUST') await deltaTrust();
  else throw new Error(`Unknown scenario ${scenario}`);
  const report = {
    scenario,
    stage,
    node: process.version,
    pid: process.pid,
    status: checks.every((c) => c.passed) ? 'passed' : 'assertion-failed',
    checks,
    facts,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.status === 'passed' ? 0 : 1;
} catch (error) {
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        scenario,
        stage,
        status: 'setup-or-runtime-error',
        error: String(error),
        stack: (error as Error).stack,
        checks,
        facts,
      },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = 2;
} finally {
  clearTimeout(timeout);
}
// Real formatting runtime may retain its own worker; every owned compiler/session is disposed above.
process.exit(process.exitCode ?? 0);
