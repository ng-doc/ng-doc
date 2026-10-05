#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { appendFile, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const THRESHOLDS = Object.freeze({ lines: 90, statements: 90, functions: 90, branches: 85 });
/** Per-group wall-clock limit unless the group declares its own `timeoutMs`; `--timeout-ms` overrides both. */
export const DEFAULT_TIMEOUT_MS = 600_000;
const require = createRequire(import.meta.url);
// `heavy` groups start real processes, build TypeScript programs or measure timing: they run one at
// a time, after the light groups, which may run concurrently (`--jobs`). Every posix group is heavy.
// `shards` splits a group's files over that many CI jobs (Vitest `--shard`); their coverage is
// merged and gated once (`--merge-coverage`).
const core = (id, runner, config, extra = {}) => ({ id, lane: 'core', runner, config, ...extra });
const posix = (id, config, extra = {}) => ({
  id,
  lane: 'posix',
  runner: 'vitest',
  config,
  heavy: true,
  ...extra,
});
/** The builder's `*.spec.ts` config (`nx test builder`), relative to libs/builder/generator. */
const SPEC_CONFIG = '../vitest.config.ts';
export const COMMANDS = Object.freeze(
  [
    core('source-boundaries', 'source'),
    // The generator's `*.spec.ts` suites run with the builder's own config, limited to `tests`;
    // `collect` names the production files their coverage gate measures (none for contracts).
    core('contracts', 'vitest', SPEC_CONFIG, {
      tests: [
        'generator/testing/contracts.spec.ts',
        'generator/testing/content-module-ids.spec.ts',
      ],
    }),
    core('session', 'vitest', SPEC_CONFIG, {
      tests: ['generator/session/testing/**/*.spec.ts'],
      collect: ['generator/session/*.ts'],
      // Asserts wall-clock budgets, so it never shares the machine with other groups.
      heavy: true,
    }),
    core('discovery', 'vitest', SPEC_CONFIG, {
      tests: ['generator/discovery/testing/**/*.spec.ts'],
      collect: ['generator/discovery/index.ts'],
      // Asserts wall-clock budgets, so it never shares the machine with other groups.
      heavy: true,
    }),
    core('artifact-cache-commit', 'vitest', SPEC_CONFIG, {
      tests: ['generator/artifacts/testing/**/*.spec.ts'],
      collect: ['generator/artifacts/index.ts'],
    }),
    // Asserts wall-clock budgets, so it never shares the machine with other groups.
    core('graph', 'vitest', 'graph/testing/vitest.config.ts', { heavy: true }),
    core('content', 'vitest', 'content/testing/vitest.config.ts'),
    core('semantic', 'vitest', 'semantic/testing/vitest.config.ts', { heavy: true }),
    core('compiler', 'vitest', 'compiler/vitest.config.ts', {
      additionalIncludes: ['generator/compiler/watch.integration.ts'],
      testTimeout: 120_000,
      timeoutMs: 2_100_000,
      heavy: true,
      shards: 4,
      // Seconds per file with coverage on a loaded macOS machine; only their ratios matter.
      shardWeights: {
        'generator/compiler/retained-program.vitest.ts': 330,
        'generator/compiler/type-order.vitest.ts': 236,
        'generator/compiler/incremental-targeted-seeds.vitest.ts': 202,
        'generator/compiler/incremental.vitest.ts': 163,
        'generator/compiler/incremental-targeted-corpus.vitest.ts': 159,
        'generator/compiler/first-edit.vitest.ts': 145,
        'generator/compiler/scoped-semantic.vitest.ts': 125,
        'generator/compiler/dry-run.vitest.ts': 124,
        'generator/compiler/incremental-targeted-cases.vitest.ts': 79,
        'generator/compiler/compiler.vitest.ts': 73,
        'generator/compiler/incremental-partition.vitest.ts': 56,
        'generator/compiler/shape-closure.vitest.ts': 56,
        'generator/compiler/fold.vitest.ts': 42,
        'generator/compiler/tracked-program.vitest.ts': 40,
        'generator/compiler/progress.vitest.ts': 38,
        'generator/compiler/fast-start.vitest.ts': 35,
        'generator/compiler/parallel-render.vitest.ts': 60,
        'generator/compiler/highlight-cache.vitest.ts': 17,
        'generator/compiler/format-cache.vitest.ts': 25,
        'generator/compiler/locale.vitest.ts': 5,
        'generator/compiler/watch.integration.ts': 5,
        'generator/compiler/classify.vitest.ts': 1,
        'generator/compiler/closure-store.vitest.ts': 1,
        'generator/compiler/retention-port.vitest.ts': 1,
        'generator/compiler/targeted.vitest.ts': 1,
      },
    }), // ~1,900 s with coverage on a loaded macOS machine (one process); four CI shards
    core('outputs', 'vitest', 'outputs/vitest.config.ts'),
    core('worker', 'vitest', 'worker/testing/vitest.config.ts', { heavy: true }),
    core('progress', 'vitest', 'progress/vitest.config.ts', {
      posixEnv: { NGDOC_REQUIRE_PTY: '1' },
      heavy: true,
    }), // POSIX: the PTY checks must run, not skip; real PTYs and timing
    posix('bootstrap', 'bootstrap/testing/vitest.config.ts'),
    posix('vite-adapter', 'vite/testing/vitest.config.ts', {
      shards: 3,
      // Seconds per file with coverage on a Linux CI runner, three files at a time; only their
      // ratios matter.
      shardWeights: {
        'libs/builder/generator/vite/testing/vite-adapter.vitest.ts': 452,
        'libs/builder/generator/vite/testing/startup-native.vitest.ts': 330,
        'libs/builder/generator/vite/testing/page-tabs-structural.vitest.ts': 272,
        'libs/builder/generator/vite/testing/page-tabs.vitest.ts': 266,
        'libs/builder/generator/vite/testing/watch-scope.vitest.ts': 75,
        'libs/builder/generator/vite/testing/reconcile-inputs.vitest.ts': 36,
        'libs/builder/generator/vite/testing/only-for-tags.vitest.ts': 34,
        'libs/builder/generator/vite/testing/watcher-recovery.vitest.ts': 6,
        'libs/builder/generator/vite/testing/host-bursts.vitest.ts': 3,
        'libs/builder/generator/vite/testing/ssr-renderer.vitest.ts': 3,
        'libs/builder/generator/vite/testing/watch-scope-units.vitest.ts': 3,
        'libs/builder/generator/vite/testing/ssr-renderer-control.vitest.ts': 2,
        'libs/builder/generator/vite/testing/watch-start.vitest.ts': 2,
        'libs/builder/generator/vite/testing/angular-composition.vitest.ts': 1,
        'libs/builder/generator/vite/testing/angular-factory.vitest.ts': 1,
        'libs/builder/generator/vite/testing/application.vitest.ts': 1,
        'libs/builder/generator/vite/testing/bounded-close.vitest.ts': 1,
        'libs/builder/generator/vite/testing/dev-styles.vitest.ts': 1,
        'libs/builder/generator/vite/testing/paths.vitest.ts': 1,
        'libs/builder/generator/vite/testing/plugin-disposal.vitest.ts': 1,
        'libs/builder/generator/vite/testing/prerender.vitest.ts': 1,
        'libs/builder/generator/vite/testing/production.vitest.ts': 1,
        'libs/builder/generator/vite/testing/progress.vitest.ts': 1,
        'libs/builder/generator/vite/testing/shared-pass.vitest.ts': 1,
        'libs/builder/generator/vite/testing/ssr-renderer-protocol.vitest.ts': 1,
        'libs/builder/generator/vite/testing/ssr-renderer-runtime.vitest.ts': 1,
        'libs/builder/generator/vite/testing/startup-composition.vitest.ts': 1,
        'libs/builder/generator/vite/testing/structural-pass.vitest.ts': 1,
        'libs/builder/generator/vite/testing/structural-updates.vitest.ts': 1,
        'libs/builder/generator/vite/testing/superseded-commit.vitest.ts': 1,
        'libs/builder/generator/vite/testing/theme-index.vitest.ts': 1,
      },
    }),
  ].map(Object.freeze),
);

export const groupTimeoutMs = (entry, override) =>
  override ?? entry.timeoutMs ?? DEFAULT_TIMEOUT_MS;

export const WEIGHTS = Object.freeze(['light', 'heavy']);
export const weightOf = (entry) => (entry.heavy ? 'heavy' : 'light');

export function commandPlan({
  groups = [],
  lane = 'core',
  platform = process.platform,
  weight,
  commands = COMMANDS,
} = {}) {
  if (!['core', 'posix'].includes(lane)) throw new Error(`Unknown lane: ${lane}`);
  if (lane === 'posix' && platform === 'win32')
    throw new Error('The posix lane requires owned POSIX process groups; Windows is unsupported.');
  if (weight !== undefined && !WEIGHTS.includes(weight))
    throw new Error(`Unknown weight: ${weight}`);
  if (!Array.isArray(groups) || groups.some((id) => !commands.some((entry) => entry.id === id)))
    throw new Error(`Unknown group: ${groups.join(', ')}`);
  if (
    groups.some(
      (id) => lane === 'core' && commands.find((entry) => entry.id === id).lane === 'posix',
    )
  )
    throw new Error('A POSIX group requires --lane posix.');
  return commands.filter(
    (entry) =>
      (lane === 'posix' || entry.lane === 'core') &&
      (!groups.length || groups.includes(entry.id)) &&
      (weight === undefined || weightOf(entry) === weight),
  );
}

/** Parses Vitest's `<index>/<count>` shard notation, 1-based. */
export function parseShard(value) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(String(value));
  const shard = match && { index: Number(match[1]), count: Number(match[2]) };
  if (!shard || shard.index > shard.count) throw new Error(`Invalid --shard: ${value}`);
  return shard;
}

/** Whether the group measures coverage at all: a group that names its tests needs `collect`. */
export const measuresCoverage = (entry) =>
  entry.runner === 'vitest' && !(entry.tests && !entry.collect);

/** The blob report a coverage shard writes and the merge reads, inside the shard's directory. */
export const blobName = ({ index, count }) => `blob-${index}-${count}.json`;

/**
 * Config wrappers live only in the fresh run directory. Existing configs remain untouched.
 *
 * - `coverage: false` runs the tests only (the CI Windows jobs; Linux measures coverage).
 * - `shard` runs one Vitest shard. With coverage, the shard writes a blob report holding its
 *   coverage and does not gate: a shard covers part of the files, so the gate is enforced once over
 *   the merged shards (`mergeFrom`).
 * - `mergeFrom` replays the blob reports of every shard and gates their merged coverage.
 */
export function commandFor(entry, directory, { coverage = true, shard, mergeFrom } = {}) {
  const reports = path.join(directory, 'coverage');
  const executable = process.execPath;
  if (entry.runner !== 'vitest') return [];
  const command = [
    executable,
    path.join(ROOT, 'node_modules/vitest/vitest.mjs'),
    'run',
    '--config',
    path.join(directory, 'vitest.config.mjs'),
  ];
  if (shard) command.push(`--shard=${shard.index}/${shard.count}`);
  if (mergeFrom) command.push(`--merge-reports=${mergeFrom}`);
  // A group that names its tests has a gate only when it names the files to measure.
  if (!coverage || !measuresCoverage(entry)) return command;
  command.push(
    '--coverage',
    `--coverage.reportsDirectory=${reports}`,
    '--coverage.reporter=text',
    '--coverage.reporter=json-summary',
  );
  if (shard) {
    command.push(
      '--reporter=default',
      '--reporter=blob',
      `--outputFile.blob=${path.join(directory, 'blob', blobName(shard))}`,
    );
    return command;
  }
  command.push(
    ...Object.entries(THRESHOLDS).map(([name, value]) => `--coverage.thresholds.${name}=${value}`),
  );
  return command;
}

/**
 * Writes the group's Vitest config wrapper; `posixEnv` applies on every platform except Windows.
 * A coverage shard drops the config's own thresholds (the merge enforces them over every shard);
 * a run without coverage writes no raw V8 records.
 */
export async function prepareConfig(
  entry,
  directory,
  platform = process.platform,
  { coverage = true, shard } = {},
) {
  if (entry.runner !== 'vitest') return;
  const config = path.join(ROOT, 'libs/builder/generator', entry.config);
  const raw = path.join(directory, 'raw-v8');
  const coverageOverrides = [
    ...(entry.collect ? [`include:${JSON.stringify(entry.collect)}`] : []),
    ...(shard && coverage ? ['thresholds:undefined'] : []),
  ];
  // A shard of a weighted group is split by weight (tools/scripts/vitest-shard.mjs).
  const balanced = shard && entry.shardWeights;
  const sharding = pathToFileURL(path.join(ROOT, 'tools/scripts/vitest-shard.mjs')).href;
  // A file-URL import of a .ts config can be externalized and sent directly to
  // Node's CommonJS loader. Let Vite load/bundle the original config instead.
  await writeFile(
    path.join(directory, 'vitest.config.mjs'),
    `import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(${JSON.stringify(pathToFileURL(config).href)});
export default async (environment) => {
  const {loadConfigFromFile} = await import(pathToFileURL(require.resolve('vite')).href);
  const loaded = await loadConfigFromFile(environment, ${JSON.stringify(config)}, ${JSON.stringify(ROOT)});
  if (!loaded) throw new Error('Cannot load the declared modernization test configuration');
  const base = loaded.config;${
    balanced
      ? `
  const {BaseSequencer} = await import(pathToFileURL(require.resolve('vitest/node')).href);
  const {balancedSequencer} = await import(${JSON.stringify(sharding)});
  const sequencer = balancedSequencer(BaseSequencer, ${JSON.stringify(entry.shardWeights)});`
      : ''
  }
  return {...base,test:{...base.test,${balanced ? 'sequence:{...base.test.sequence,sequencer},' : ''}include:${entry.tests ? JSON.stringify(entry.tests) : `[...base.test.include,...${JSON.stringify(entry.additionalIncludes ?? [])}]`},${coverageOverrides.length ? `coverage:{...base.test.coverage,${coverageOverrides.join(',')}},` : ''}${entry.testTimeout ? `testTimeout:${entry.testTimeout},hookTimeout:${entry.testTimeout},` : ''}env:{...base.test.env,${platform !== 'win32' && entry.posixEnv ? `...${JSON.stringify(entry.posixEnv)},` : ''}${coverage ? `NODE_V8_COVERAGE:${JSON.stringify(raw)},` : ''}NGDOC_TEST_EVIDENCE_DIR:${JSON.stringify(directory)}}}};
};
`,
  );
}

/**
 * A file's path relative to the repository root with forward slashes, so a boundary violation reads
 * the same on every OS. `rules` is a test port (`path.win32`).
 */
export function repositoryPath(root, file, rules = path) {
  return rules.relative(root, file).split(rules.sep).join('/');
}

export async function sourceBoundaryCheck(root = ROOT) {
  const ts = require('typescript');
  const base = path.join(root, 'libs/builder/generator');
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['testing', 'acceptance', 'node_modules'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (
        /\.(?:[cm]?ts|tsx)$/.test(file) &&
        !/\.(?:spec|vitest|config|d)\.[cm]?ts$/.test(file)
      )
        files.push(file);
    }
  }
  for (const name of [
    'artifacts',
    'compiler',
    'content',
    'discovery',
    'graph',
    'kernel',
    'outputs',
    'progress',
    'semantic',
    'session',
    'worker',
  ])
    await walk(path.join(base, name));
  for (const name of ['contracts.ts', 'content-module-ids.ts']) files.push(path.join(base, name));
  const violations = [];
  const layering = [];
  const leaf = [];
  // The progress module is pure: its own files, Node built-ins, and types from the contract.
  // Relative specifiers are resolved first, so `./../session` cannot pass as a local import.
  const progressDir = path.join(base, 'progress') + path.sep;
  const typeOnly = (node) =>
    ts.isImportTypeNode(node) ||
    (ts.isImportDeclaration(node)
      ? node.importClause?.isTypeOnly === true
      : ts.isExportDeclaration(node) && node.isTypeOnly);
  const progressAllows = (node, specifier, file) => {
    // `require` and `import x = require()` load anything at run time: ESM imports only.
    if (
      ts.isImportEqualsDeclaration(node) ||
      (ts.isCallExpression(node) && node.expression.kind !== ts.SyntaxKind.ImportKeyword)
    )
      return false;
    if (specifier === 'node:module') return false;
    if (specifier.startsWith('node:')) return true;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return false;
    const resolved = path.posix.normalize(
      path.posix.join(path.relative(base, path.dirname(file)).split(path.sep).join('/'), specifier),
    );
    return resolved.startsWith('progress/') || (resolved === 'contracts' && typeOnly(node));
  };
  // The kernel is the engine's leaf: every stage may import it, so it imports no stage, adapter or
  // package, only its own files, Node built-ins and the contract.
  const kernelDir = path.join(base, 'kernel') + path.sep;
  const kernelAllows = (node, specifier, file) => {
    if (
      ts.isImportEqualsDeclaration(node) ||
      (ts.isCallExpression(node) && node.expression.kind !== ts.SyntaxKind.ImportKeyword)
    )
      return false;
    if (specifier.startsWith('node:')) return true;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return false;
    const resolved = path.posix.normalize(
      path.posix.join(path.relative(base, path.dirname(file)).split(path.sep).join('/'), specifier),
    );
    return resolved.startsWith('kernel/') || resolved === 'contracts';
  };
  // A render thread runs only the HTML pipeline: its files import the pipeline, the digest, the
  // worker protocol, the bundled HTML utilities and the search parser, and Node's thread port. No
  // file system, no stage and no other package reach a thread (types erase and may come from anywhere).
  const threadFiles = new Set(
    ['content/html-worker.ts', 'content/html-pipeline.ts'].map((file) => path.join(base, file)),
  );
  const threadAllows = (node, specifier, file) => {
    if (
      ts.isImportEqualsDeclaration(node) ||
      (ts.isCallExpression(node) && node.expression.kind !== ts.SyntaxKind.ImportKeyword)
    )
      return false;
    if (typeOnly(node)) return true;
    if (['node:worker_threads', '@ng-doc/utils', '@orama/plugin-parsedoc'].includes(specifier))
      return true;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return false;
    const resolved = path.posix.normalize(
      path.posix.join(path.relative(base, path.dirname(file)).split(path.sep).join('/'), specifier),
    );
    return ['content/html-pipeline', 'kernel/canonical', 'worker/protocol', 'contracts'].includes(
      resolved,
    );
  };
  const thread = [];
  const privateImport =
    /^(?:@angular-devkit\/(?:build-angular|architect)(?:\/|$)|@angular-devkit\/core\/(?:src|private)(?:\/|$)|@angular\/(?:build|cli)(?:\/|$)|@angular\/compiler-cli\/(?:src|private)(?:\/|$)|@ngtools\/webpack(?:\/|$))/;
  for (const file of files.sort()) {
    const source = ts.createSourceFile(
      file,
      await readFile(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      let target;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        target = node.moduleSpecifier;
      else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        target = node.moduleReference.expression;
      else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      )
        target = node.arguments[0];
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        target = node.argument.literal;
      if (
        file.startsWith(progressDir) &&
        ((ts.isIdentifier(node) && node.text === 'createRequire') ||
          (ts.isPropertyAccessExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'module' &&
            node.name.text === 'require'))
      )
        layering.push(
          `${repositoryPath(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.getText()}`,
        );
      if (target && (ts.isStringLiteral(target) || ts.isNoSubstitutionTemplateLiteral(target))) {
        const where = `${repositoryPath(root, file)}:${source.getLineAndCharacterOfPosition(target.getStart()).line + 1}: ${target.text}`;
        if (privateImport.test(target.text)) violations.push(where);
        if (file.startsWith(progressDir) && !progressAllows(node, target.text, file))
          layering.push(where);
        if (file.startsWith(kernelDir) && !kernelAllows(node, target.text, file)) leaf.push(where);
        if (threadFiles.has(file) && !threadAllows(node, target.text, file)) thread.push(where);
      } else if (target && threadFiles.has(file))
        thread.push(
          `${repositoryPath(root, file)}:${source.getLineAndCharacterOfPosition(target.getStart()).line + 1}: <computed specifier>`,
        );
      else if (target && (file.startsWith(progressDir) || file.startsWith(kernelDir)))
        (file.startsWith(progressDir) ? layering : leaf).push(
          `${repositoryPath(root, file)}:${source.getLineAndCharacterOfPosition(target.getStart()).line + 1}: <computed specifier>`,
        );
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  if (violations.length)
    throw new Error(
      `Private Angular CLI imports found in generator core:\n${violations.join('\n')}`,
    );
  if (layering.length)
    throw new Error(
      `The progress module may import only ./*, node:* and types from ../contracts:\n${layering.join('\n')}`,
    );
  if (leaf.length)
    throw new Error(
      `The kernel is a leaf and may import only ./*, node:* and ../contracts:\n${leaf.join('\n')}`,
    );
  if (thread.length)
    throw new Error(
      `A render thread may import only the HTML pipeline, the digest, the worker protocol, @ng-doc/utils, @orama/plugin-parsedoc and node:worker_threads:\n${thread.join('\n')}`,
    );
  return { filesChecked: files.length, adaptersExcluded: ['vite', 'bootstrap'] };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Sends `value` (0 probes) to a pid or process group (-pgid) and reports whether the target still
 * exists. Never throws: ESRCH means gone. macOS answers EPERM for a group whose only members have
 * exited but are not yet reaped (e.g. the leader before Node reaps it); that counts as present, so
 * callers keep polling within their deadline. Any other error is also treated as present.
 */
function signalTarget(target, value, errors) {
  try {
    process.kill(target, value);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    const code = error?.code ?? 'UNKNOWN';
    errors[code] = (errors[code] ?? 0) + 1;
    return true;
  }
}

/** On POSIX owns the whole detached group; Windows timeout uses taskkill, with limited verification. */
export async function runCommand(
  argv,
  {
    cwd = ROOT,
    logFile,
    env = process.env,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    graceMs = 2_000,
    killMs = 5_000,
    settleMs = 250,
    signal,
    platform = process.platform,
    maxOutputBytes = 64 * 1024 * 1024,
  } = {},
) {
  if (!Array.isArray(argv) || !argv.length || argv.some((item) => typeof item !== 'string'))
    throw new TypeError('runCommand requires non-empty string argv');
  if (
    !logFile ||
    ![timeoutMs, graceMs, killMs, settleMs, maxOutputBytes].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    )
  )
    throw new TypeError('logFile and positive finite deadlines are required');
  await mkdir(path.dirname(logFile), { recursive: true });
  await writeFile(logFile, `${JSON.stringify({ argv, cwd, started: new Date().toISOString() })}\n`);
  let logging = Promise.resolve();
  let logError;
  let outputBytes = 0;
  let overflow = false;
  let stopReason;
  let stopWake;
  const stop = new Promise((resolve) => {
    stopWake = resolve;
  });
  const requestStop = (reason) => {
    stopReason ??= reason;
    stopWake();
  };
  const log = (chunk) => {
    if (overflow) return;
    outputBytes += chunk.byteLength;
    if (outputBytes > maxOutputBytes) {
      overflow = true;
      requestStop('output-limit');
      return;
    }
    logging = logging
      .then(() => appendFile(logFile, chunk))
      .catch((error) => {
        logError ??= error;
        requestStop('log-error');
      });
  };
  const onAbort = () => requestStop('interrupted');
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) requestStop('interrupted');
  let child,
    spawnError,
    exitCode = null,
    exitSignal = null,
    closed = false,
    forcedCleanup = false,
    escalated = false,
    cleanupError;
  const signalErrors = {};
  // A group/pid that once answered ESRCH cannot come back (nothing can join a dead pgid), so the
  // first ESRCH latches `gone`: later probes and signals could only reach a reused id.
  let gone = false;
  const target = () => (platform === 'win32' ? child.pid : -child.pid);
  const signalOwned = (value) => {
    if (gone || !child?.pid) return false;
    if (!signalTarget(target(), value, signalErrors)) gone = true;
    return !gone;
  };
  const present = () => signalOwned(0);
  const timer = setTimeout(() => requestStop('timeout'), timeoutMs);
  try {
    if (!stopReason) {
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env,
        detached: platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const joined = new Promise((resolve) => {
        child.once('error', (error) => {
          spawnError = error;
        });
        child.once('close', (code, exitSignalValue) => {
          closed = true;
          exitCode = code;
          exitSignal = exitSignalValue;
          resolve();
        });
      });
      child.stdout.on('data', log);
      child.stderr.on('data', log);
      await Promise.race([joined, stop]);
      clearTimeout(timer);
      if (closed && !stopReason) {
        // After a natural exit a just-exited member can linger unreaped for a moment (macOS
        // answers EPERM for such a zombie-only group); let it settle before calling it a leak.
        const settleUntil = Date.now() + settleMs;
        while (present() && Date.now() < settleUntil) await delay(10);
      }
      if (!closed || present()) {
        forcedCleanup = true;
        if (platform === 'win32') {
          // No POSIX group semantics. Native CI must verify this backend; orphaned
          // descendants after an already-exited Windows leader are not claimed joined.
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          killer.stdout.on('data', log);
          killer.stderr.on('data', log);
          await new Promise((resolve) => {
            const deadline = setTimeout(() => {
              cleanupError = 'taskkill deadline';
              killer.kill();
              resolve();
            }, killMs);
            killer.once('error', (error) => {
              cleanupError = String(error);
              clearTimeout(deadline);
              resolve();
            });
            killer.once('close', (code) => {
              if (code !== 0) cleanupError ??= `taskkill exited ${code}`;
              clearTimeout(deadline);
              resolve();
            });
          });
        } else {
          // TERM the whole group, give it graceMs, then KILL it; every signal tolerates EPERM/ESRCH.
          signalOwned('SIGTERM');
          const graceUntil = Date.now() + graceMs;
          while (present() && Date.now() < graceUntil) await delay(10);
          if (present()) {
            escalated = true;
            signalOwned('SIGKILL');
          }
        }
        const until = Date.now() + killMs;
        let resend = Date.now() + 250;
        while ((!closed || present()) && Date.now() < until) {
          await delay(10);
          // A member forked around the first KILL (or one refused with EPERM) gets another KILL.
          if (escalated && !gone && Date.now() >= resend) {
            signalOwned('SIGKILL');
            resend = Date.now() + 250;
          }
        }
        if (!closed || present())
          cleanupError ??= `Owned child/group did not join before deadline (${killMs} ms)${Object.keys(signalErrors).length ? `; kill errors ${JSON.stringify(signalErrors)}` : ''}`;
      }
    }
  } catch (error) {
    spawnError ??= error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  await logging;
  const code =
    stopReason === 'interrupted'
      ? 130
      : stopReason === 'timeout'
        ? 124
        : spawnError || logError || cleanupError || forcedCleanup || overflow
          ? 1
          : exitCode ?? 1;
  const exited = `exited with code ${exitCode}${exitSignal ? ` (signal ${exitSignal})` : ''}`;
  const reason =
    {
      timeout: `timed out after ${timeoutMs} ms`,
      interrupted: 'interrupted',
      'output-limit': `exceeded the ${maxOutputBytes}-byte output limit`,
      'log-error': `could not write its log: ${logError}`,
    }[stopReason] ??
    (spawnError
      ? `failed to run: ${spawnError}`
      : forcedCleanup
        ? `${exited}, but its process group was still running after ${settleMs} ms and had to be killed`
        : code !== 0
          ? exited
          : undefined);
  const message = reason && `${reason}${cleanupError ? `; ${cleanupError}` : ''}`;
  const result = {
    code,
    ...(message ? { message } : {}),
    timeoutMs,
    exitCode,
    signal: exitSignal,
    stopReason,
    overflow,
    outputBytes,
    forcedCleanup,
    escalated,
    joinedChild: !child || closed,
    stillOwned: child?.pid && present() ? [child.pid] : [],
    ...(Object.keys(signalErrors).length ? { signalErrors } : {}),
    ownership:
      platform === 'win32'
        ? 'windows-taskkill-tree; descendant verification unavailable after leader exit'
        : 'posix-process-group',
    ...(spawnError ? { spawnError: String(spawnError) } : {}),
    ...(logError ? { logError: String(logError) } : {}),
    ...(cleanupError ? { cleanupError } : {}),
    argv,
    logFile,
  };
  await appendFile(logFile, `${JSON.stringify(result)}\n`);
  return result;
}

/** Light groups run this many at a time unless `--jobs` says otherwise. */
export const defaultJobs = (cpus = os.availableParallelism()) =>
  Math.max(1, Math.min(4, Math.floor(cpus / 2)));

/**
 * The blob reports a merge expects: exactly one per shard of `count`. A missing shard would leave
 * its files out of the gate, so the merge refuses to run without every one.
 */
export async function shardBlobProblems(directory, count) {
  const expected = Array.from({ length: count }, (_, i) => blobName({ index: i + 1, count }));
  let actual;
  try {
    actual = (await readdir(directory)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [`no blob directory: ${directory}`];
    throw error;
  }
  return [
    ...expected.filter((name) => !actual.includes(name)).map((name) => `missing shard: ${name}`),
    ...actual.filter((name) => !expected.includes(name)).map((name) => `unexpected file: ${name}`),
  ];
}

/**
 * Runs the plan. Light groups run first, up to `jobs` at a time; heavy groups then run one at a
 * time. The run stops starting groups at the first failure. `shard` runs one shard of a single
 * group; `mergeFrom` merges and gates the shards of a single sharded group instead of running tests.
 */
export async function runPlan({
  groups = [],
  lane = 'core',
  logDir,
  timeoutMs,
  signal,
  jobs = defaultJobs(),
  weight,
  coverage = true,
  shard,
  mergeFrom,
  execute = runCommand,
  commands = COMMANDS,
} = {}) {
  const plan = commandPlan({ groups, lane, weight, commands });
  if (!logDir) throw new Error('--log-dir is required for execution');
  if (!Number.isSafeInteger(jobs) || jobs < 1) throw new Error(`Invalid jobs: ${jobs}`);
  if ((shard || mergeFrom) && (plan.length !== 1 || plan[0].runner !== 'vitest'))
    throw new Error(`${shard ? '--shard' : '--merge-coverage'} needs exactly one Vitest --group`);
  if (mergeFrom && !plan[0].shards) throw new Error(`${plan[0].id} is not a sharded group`);
  if (mergeFrom && (!coverage || !measuresCoverage(plan[0])))
    throw new Error('--merge-coverage gates coverage; the group must measure it');
  const output = path.resolve(logDir);
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output); // Refuse stale/reused evidence instead of overwriting it.
  const results = [];
  const record = (result) => {
    results.push(result);
    results.sort(
      (a, b) => plan.findIndex((e) => e.id === a.id) - plan.findIndex((e) => e.id === b.id),
    );
  };
  let writing = Promise.resolve();
  const writeResults = () =>
    (writing = writing.then(() =>
      writeFile(
        path.join(output, 'results.json'),
        JSON.stringify(
          {
            lane,
            node: process.version,
            platform: process.platform,
            ...(shard ? { shard: `${shard.index}/${shard.count}` } : {}),
            ...(mergeFrom ? { merged: plan[0].shards } : {}),
            ...(coverage ? {} : { coverage: false }),
            results,
          },
          null,
          2,
        ) + '\n',
      ),
    ));
  let failed = false;
  const runGroup = async (entry) => {
    const directory = path.join(output, entry.id);
    await mkdir(directory);
    const logFile = path.join(directory, 'run.log');
    const groupTimeout = groupTimeoutMs(entry, timeoutMs);
    try {
      if (signal?.aborted) throw new Error('Plan interrupted before next group');
      let result;
      if (entry.runner === 'source') {
        result = { id: entry.id, code: 0, ...(await sourceBoundaryCheck()) };
        await writeFile(logFile, JSON.stringify(result) + '\n');
      } else {
        if (mergeFrom) {
          const problems = await shardBlobProblems(path.resolve(mergeFrom), entry.shards);
          if (problems.length) throw new Error(`Cannot merge ${entry.id}:\n${problems.join('\n')}`);
        }
        await prepareConfig(entry, directory, process.platform, { coverage, shard });
        result = {
          id: entry.id,
          ...(await execute(
            commandFor(entry, directory, {
              coverage,
              shard,
              mergeFrom: mergeFrom && path.resolve(mergeFrom),
            }),
            {
              logFile,
              timeoutMs: groupTimeout,
              signal,
              env: {
                ...process.env,
                CI: '1',
                NX_DAEMON: 'false',
                NX_NO_CLOUD: 'true',
                NGDOC_TEST_EVIDENCE_DIR: directory,
                ...(coverage ? { NODE_V8_COVERAGE: path.join(directory, 'raw-v8') } : {}),
              },
            },
          )),
        };
      }
      record(result);
    } catch (error) {
      await appendFile(logFile, `${error.stack ?? error}\n`);
      record({ id: entry.id, code: 1, error: String(error), logFile });
    }
    if (results.find((result) => result.id === entry.id).code !== 0) failed = true;
    await writeResults();
  };
  // Light groups share the machine; a failure lets the running ones finish and starts no more.
  const light = plan.filter((entry) => !entry.heavy);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(jobs, light.length) }, async () => {
      while (!failed && next < light.length) await runGroup(light[next++]);
    }),
  );
  for (const entry of plan.filter((item) => item.heavy)) {
    if (failed) break;
    await runGroup(entry);
  }
  await writing;
  return results;
}

/** `platform` is a test port: the posix lane is refused on Windows. */
export function parseArgs(args, { platform = process.platform } = {}) {
  const options = { groups: [], lane: 'core' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--list', '--source-check'].includes(arg)) {
      if (args.length !== 1) throw new Error(`${arg} must be used alone`);
      return { mode: arg.slice(2) };
    }
    if (arg === '--no-coverage') {
      options.coverage = false;
      continue;
    }
    if (
      ![
        '--group',
        '--lane',
        '--log-dir',
        '--timeout-ms',
        '--jobs',
        '--weight',
        '--shard',
        '--merge-coverage',
      ].includes(arg) ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    )
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    const value = args[++i];
    if (arg === '--group') options.groups.push(value);
    else if (arg === '--lane') options.lane = value;
    else if (arg === '--log-dir') options.logDir = value;
    else if (arg === '--jobs') options.jobs = Number(value);
    else if (arg === '--weight') options.weight = value;
    else if (arg === '--shard') options.shard = parseShard(value);
    else if (arg === '--merge-coverage') options.mergeFrom = value;
    else options.timeoutMs = Number(value);
  }
  const plan = commandPlan({ ...options, platform });
  if (!options.logDir) throw new Error('--log-dir is required for execution');
  if (
    options.timeoutMs !== undefined &&
    (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)
  )
    throw new Error('Invalid --timeout-ms');
  if (options.jobs !== undefined && (!Number.isSafeInteger(options.jobs) || options.jobs < 1))
    throw new Error('Invalid --jobs');
  if ((options.shard || options.mergeFrom) && (plan.length !== 1 || plan[0].runner !== 'vitest'))
    throw new Error(
      `${options.shard ? '--shard' : '--merge-coverage'} needs exactly one Vitest --group`,
    );
  if (options.shard && options.mergeFrom)
    throw new Error('--shard and --merge-coverage are separate steps');
  if (options.mergeFrom && options.coverage === false)
    throw new Error('--merge-coverage gates coverage; it cannot run with --no-coverage');
  return options;
}

/** Trailing lines of a failed group's log that the CLI prints, so a CI job log shows the failure. */
export const FAILURE_LOG_TAIL_LINES = 200;

/**
 * The last lines of a group's log, with a note of how many earlier lines the file keeps.
 * @param {string} file - The log file.
 * @param {number} [count] - How many trailing lines to keep.
 * @returns {Promise<string>} The tail, or why the log could not be read.
 */
export async function logTail(file, count = FAILURE_LOG_TAIL_LINES) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    return `(the log could not be read: ${error.message})`;
  }
  const lines = text.replace(/\n$/, '').split('\n');
  const earlier = lines.length - count;
  return [
    ...(earlier > 0 ? [`(${earlier} earlier lines are in the log file)`] : []),
    ...lines.slice(-count),
  ].join('\n');
}

export async function isMain(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  try {
    return (await realpath(fileURLToPath(moduleUrl))) === (await realpath(path.resolve(argvPath)));
  } catch {
    return false;
  }
}

if (await isMain(import.meta.url)) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === 'list')
      for (const entry of COMMANDS)
        console.log(
          `${entry.id}\t${entry.lane}\t${entry.runner}\t${groupTimeoutMs(entry)}ms\t${weightOf(entry)}${entry.shards ? `\t${entry.shards} shards` : ''}`,
        );
    else if (options.mode === 'source-check')
      console.log(JSON.stringify(await sourceBoundaryCheck()));
    else {
      const results = await runPlan({ ...options, signal: controller.signal });
      for (const entry of results.filter((result) => result.code !== 0)) {
        const hint = entry.stopReason === 'timeout' ? ' (raise it with --timeout-ms)' : '';
        console.error(
          `check-builder-modernization: ${entry.id}: ${entry.message ?? entry.error ?? `failed with code ${entry.code}`}${hint}; log: ${entry.logFile}`,
        );
        // CI keeps the log only as an artifact; its tail in the job log names the failure.
        if (entry.logFile)
          console.error(
            `--- ${entry.id}: last ${FAILURE_LOG_TAIL_LINES} lines of ${entry.logFile} ---\n${await logTail(entry.logFile)}\n--- end of ${entry.id} ---`,
          );
      }
      process.exitCode = controller.signal.aborted
        ? 130
        : results.every((entry) => entry.code === 0)
          ? 0
          : 1;
    }
  } catch (error) {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    if (controller.signal.aborted) process.exitCode = 130;
  }
}
