import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repository = path.resolve(fileURLToPath(new URL('../../../../..', import.meta.url)));
export const runtimeSnapshot = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-native-runtime-'));
const runtimeBuilder = path.join(runtimeSnapshot, 'builder');
await mkdir(runtimeBuilder, { recursive: true });
await cp(
  path.join(repository, 'dist/libs/builder/generator'),
  path.join(runtimeBuilder, 'generator'),
  { recursive: true },
);
await symlink(
  path.join(repository, 'node_modules'),
  path.join(runtimeBuilder, 'node_modules'),
  'dir',
);
const cliUrl = pathToFileURL(path.join(runtimeBuilder, 'generator/bootstrap/cli.js'));
const { runGeneratorCli } = await import(cliUrl.href);

export async function createProject(workspace, projectId, options = {}) {
  const docs = path.join(workspace, 'docs');
  const guide = path.join(docs, 'guide');
  const api = path.join(workspace, 'src/api');
  await Promise.all([mkdir(guide, { recursive: true }), mkdir(api, { recursive: true })]);
  const paths = {
    workspace,
    projectId,
    docs,
    guide,
    api,
    config: path.join(workspace, 'ng-doc.config.mjs'),
    tsconfig: path.join(workspace, 'tsconfig.json'),
    output: path.join(workspace, 'generated'),
    cache: path.join(options.cacheParent ?? workspace, 'cache', projectId),
    category: path.join(docs, 'ng-doc.category.ts'),
    apiDescription: path.join(docs, 'ng-doc.api.ts'),
    initialApi: path.join(api, 'initial.ts'),
    addedApi: path.join(api, 'added.ts'),
    renamedApi: path.join(api, 'renamed.ts'),
    page: path.join(guide, 'ng-doc.page.ts'),
    first: path.join(guide, 'first.md.nunj'),
    second: path.join(guide, 'second.md.nunj'),
    shared: path.join(guide, 'shared.nunj'),
    repaired: path.join(guide, 'shared-repaired.nunj'),
  };
  await writeFile(
    paths.config,
    `export default {
  docsPath: 'docs',
  tsConfig: 'tsconfig.json',
  routePrefix: '',
  cache: true,
  shiki: { themes: { light: 'github-light', dark: 'ayu-dark' } },
};
`,
  );
  await writeFile(
    paths.tsconfig,
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          skipLibCheck: true,
          types: [],
        },
        include: ['docs/**/*.ts', 'src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    paths.category,
    `/** ${projectId} category. */
const Category = { title: '${projectId} category', route: '${projectId}' };
export default Category;
`,
  );
  await writeFile(
    paths.apiDescription,
    `const Api = {
  title: '${projectId} API',
  route: 'api',
  scopes: [{ name: 'Public', route: 'public', include: ['src/api/**/*.ts'] }],
};
export default Api;
`,
  );
  await writeFile(
    paths.initialApi,
    `/** Initial ${projectId} API declaration. */
export class InitialApi { readonly project = '${projectId}'; }
`,
  );
  await writeFile(
    paths.page,
    `import Category from '../ng-doc.category';
/** ${projectId} native watcher guide. */
const Page = {
  title: '${projectId} guide',
  route: 'guide',
  category: Category,
  mdFile: ['./first.md.nunj', './second.md.nunj'],
};
export default Page;
`,
  );
  await writeTabs(paths, './shared.nunj');
  await writeFile(paths.shared, `${projectId} shared version 0 with \`AddedApi\`.`);
  return paths;
}

export async function writeTabs(paths, include) {
  await Promise.all([
    writeFile(
      paths.first,
      `---\ntitle: First ${paths.projectId}\nroute: first\n---\n# First ${paths.projectId}\n{% include '${include}' %}\n`,
    ),
    writeFile(
      paths.second,
      `---\ntitle: Second ${paths.projectId}\nroute: second\n---\n# Second ${paths.projectId}\n{% include '${include}' %}\n`,
    ),
  ]);
}

class ResultObserver {
  #buffer = '';
  #historyLimit;
  #waiters = new Set();
  results = [];
  diagnostics = [];
  stderr = '';

  constructor(options = {}) {
    this.#historyLimit = options.historyLimit ?? Number.POSITIVE_INFINITY;
    assert(
      this.#historyLimit === Number.POSITIVE_INFINITY ||
        (Number.isInteger(this.#historyLimit) && this.#historyLimit > 0),
      'Result history limit must be a positive integer',
    );
  }

  stdout = (text) => {
    this.#buffer += text;
    let newline;
    while ((newline = this.#buffer.indexOf('\n')) >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.kind === 'result') this.#push(event.result);
      else if (event.kind === 'diagnostic') this.diagnostics.push(event.diagnostic);
    }
  };

  #push(result) {
    this.results.push(result);
    for (const waiter of [...this.#waiters]) {
      if (!waiter.predicate(result)) continue;
      this.#waiters.delete(waiter);
      clearTimeout(waiter.timeout);
      waiter.resolve(result);
    }
    if (this.results.length > this.#historyLimit) {
      this.results.splice(0, this.results.length - this.#historyLimit);
    }
  }

  state() {
    return {
      historyCount: this.results.length,
      historyLimit: this.#historyLimit,
      waiterCount: this.#waiters.size,
      diagnosticsCount: this.diagnostics.length,
      bufferedBytes: Buffer.byteLength(this.#buffer),
      stderrBytes: Buffer.byteLength(this.stderr),
    };
  }

  wait(predicate, timeoutMs = 60_000) {
    const existing = this.results.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timeout: setTimeout(() => {
          this.#waiters.delete(waiter);
          reject(
            new Error(
              `Timed out; results=${this.results
                .map((result) => `${result.generation}:${result.status}`)
                .join(',')} stderr=${this.stderr}`,
            ),
          );
        }, timeoutMs),
      };
      this.#waiters.add(waiter);
    });
  }
}

export async function startProject(paths, trace, options = {}) {
  const observer = new ResultObserver({ historyLimit: options.resultHistoryLimit });
  const controller = new AbortController();
  const io = {
    cwd: () => paths.workspace,
    stdout: observer.stdout,
    stderr: (text) => {
      observer.stderr += text;
    },
  };
  const args = [
    'watch',
    '--project',
    paths.projectId,
    '--workspace',
    paths.workspace,
    '--config',
    paths.config,
    '--docs-root',
    paths.docs,
    '--tsconfig',
    paths.tsconfig,
    '--output-root',
    paths.output,
    '--cache-root',
    paths.cache,
    '--json',
  ];
  const running = runGeneratorCli(args, io, controller.signal);
  const reconciled = await observer.wait(
    (result) => result.generation >= 2 && result.status === 'success',
  );
  record(trace, paths.projectId, 'started', reconciled);
  return {
    paths,
    observer,
    reconciled,
    async stop() {
      if (!controller.signal.aborted) controller.abort({ exitCode: 143 });
      const code = await running;
      assert.equal(code, 143, `${paths.projectId} watch did not join cleanly: ${observer.stderr}`);
      trace.push({ at: Date.now(), projectId: paths.projectId, event: 'stopped', code });
    },
  };
}

export async function waitAfter(handle, generation, predicate, trace, label) {
  const result = await handle.observer.wait(
    (candidate) => candidate.generation > generation && predicate(candidate),
  );
  record(trace, handle.paths.projectId, label, result);
  return result;
}

function record(trace, projectId, event, result) {
  trace.push({
    at: Date.now(),
    projectId,
    event,
    generation: result.generation,
    status: result.status,
    revision: result.status === 'success' ? result.snapshot.revision : result.lastGoodRevision,
    diagnostics: result.diagnostics.map(({ code, severity }) => ({ code, severity })),
    whyRebuilt: result.whyRebuilt,
  });
}

export function success(result) {
  assert.equal(
    result.status,
    'success',
    `Expected success: ${JSON.stringify(result.diagnostics, null, 2)}`,
  );
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    false,
  );
  return result;
}

export async function assertComplete(result, expected = {}) {
  success(result);
  const configuration = result.snapshot.configuration;
  assert(configuration, 'Successful snapshot omitted published configuration');
  const outputRoot = configuration.outputRoot;
  const outputs = result.snapshot.artifacts.flatMap((artifact) => artifact.outputs);
  const byPath = new Map(outputs.map((output) => [output.path, output]));
  assert.equal(byPath.size, outputs.length, 'Candidate contained duplicate output paths');
  for (const output of outputs) {
    const bytes = await readFile(path.join(outputRoot, output.path));
    assert.equal(hash(bytes), output.digest, `Digest mismatch for ${output.path}`);
  }
  const manifest = JSON.parse(
    await readFile(path.join(outputRoot, '.ng-doc-output-manifest.json'), 'utf8'),
  );
  assert.deepEqual(manifest, result.manifest);
  assert.equal(manifest.files.length, outputs.length);
  for (const file of manifest.files) {
    assert.equal(byPath.get(file.path)?.digest, file.digest);
  }
  const searchOutput = outputs.find((output) => output.role === 'search');
  const keywordOutput = outputs.find(
    (output) => output.path === `${configuration.assetDirectory}/keywords.json`,
  );
  const routesOutput = outputs.find((output) => output.role === 'routes');
  assert(searchOutput && keywordOutput && routesOutput, 'Aggregate output set is incomplete');
  const search = JSON.parse(await readFile(path.join(outputRoot, searchOutput.path), 'utf8'));
  const expectedSearch = result.snapshot.artifacts.flatMap((artifact) => artifact.searchRecords);
  assert.deepEqual(search, expectedSearch);
  const keywordsText = await readFile(path.join(outputRoot, keywordOutput.path), 'utf8');
  assert.deepEqual(JSON.parse(keywordsText), JSON.parse(keywordOutput.content));
  const html = result.snapshot.artifacts
    .flatMap((artifact) => artifact.content)
    .map((content) => content.html)
    .join('\n');
  for (const text of expected.html ?? []) assert.match(html, new RegExp(escapeRegExp(text)));
  const api = result.snapshot.artifacts.flatMap((artifact) => artifact.apiList);
  for (const name of expected.api ?? [])
    assert(
      api.some((item) => item.name === name),
      `Missing API ${name}`,
    );
  for (const name of expected.noApi ?? [])
    assert(!api.some((item) => item.name === name), `Stale API ${name}`);
  if (expected.keyword) assert.match(keywordsText, new RegExp(escapeRegExp(expected.keyword)));
  if (expected.noKeyword)
    assert.doesNotMatch(keywordsText, new RegExp(escapeRegExp(expected.noKeyword)));
  for (const route of expected.routes ?? [])
    assert.match(routesOutput.content, new RegExp(escapeRegExp(route)));
  return { outputRoot, outputs, search, html, api, keywordsText, routesText: routesOutput.content };
}

export async function fileState(root) {
  const state = {};
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else {
        const [bytes, info] = await Promise.all([
          readFile(absolute),
          stat(absolute, { bigint: true }),
        ]);
        state[path.relative(root, absolute).replaceAll(path.sep, '/')] = {
          digest: hash(bytes),
          mtimeNs: info.mtimeNs.toString(),
        };
      }
    }
  }
  await visit(root);
  return state;
}

export async function artifactCacheFiles(root) {
  const paths = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.name.endsWith('.artifact.json')) paths.push(absolute);
    }
  }
  await visit(root);
  return paths.sort();
}

export async function absent(filename) {
  try {
    await access(filename);
    return false;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

export function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function provenance() {
  return {
    ...JSON.parse(
      await readFile(path.join(runtimeBuilder, 'generator/build-provenance.json'), 'utf8'),
    ),
    runtimeSnapshot,
    dependencyBoundary: path.join(runtimeBuilder, 'node_modules'),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
