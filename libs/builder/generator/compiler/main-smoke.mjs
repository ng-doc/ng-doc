import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { constants as zlibConstants, createGzip, gunzip } from 'node:zlib';

const repository = path.resolve(import.meta.dirname, '../../../..');
const evidence = path.join(repository, 'docs/architecture/evidence/t10/main');
const profileEnabled = process.env.NGDOC_MAIN_PROFILE === '1';
const profileEvidence = path.join(evidence, 'profiling');
const cpuProfileFile = path.join(profileEvidence, 'compiler.cpuprofile');
const compressedCpuProfileFile = `${cpuProfileFile}.gz`;
const profileRuntimeFile = path.join(profileEvidence, 'runtime.json');
const preTransportFile = path.join(profileEvidence, 'pre-transport.json');
const retainedCompilerBundleFile = path.join(profileEvidence, 'compiler.bundle.mjs');
const retainedCompilerSourceMapFile = path.join(profileEvidence, 'compiler.bundle.mjs.map');
const startedAt = new Date().toISOString();
const startedRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repository,
  encoding: 'utf8',
}).trim();
await mkdir(evidence, { recursive: true });
if (profileEnabled) {
  await mkdir(profileEvidence, { recursive: true });
  await Promise.all([
    rm(cpuProfileFile, { force: true }),
    rm(compressedCpuProfileFile, { force: true }),
    rm(profileRuntimeFile, { force: true }),
    rm(preTransportFile, { force: true }),
    rm(path.join(profileEvidence, 'summary.json'), { force: true }),
    rm(path.join(profileEvidence, 'provenance.json'), { force: true }),
    rm(retainedCompilerBundleFile, { force: true }),
    rm(retainedCompilerSourceMapFile, { force: true }),
  ]);
}
const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'ngdoc-main-worker-')));
const sourceConfig = path.join(repository, 'apps/ng-doc/ng-doc.config.ts');
const productionTsConfig = path.join(repository, 'apps/ng-doc/tsconfig.build.json');
const outputRoot = path.join(temporary, 'candidate-output');
const cacheRoot = path.join(temporary, 'cache');
let proxy;
let progress;
try {
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  await symlink(path.join(repository, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  const configFile = sourceConfig;
  const factoryFile = path.join(temporary, 'compiler.mjs');
  const bundled = await build({
    absWorkingDir: repository,
    entryPoints: ['libs/builder/generator/compiler/index.ts'],
    outfile: factoryFile,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    metafile: true,
    ...(profileEnabled ? { sourcemap: 'external' } : {}),
    alias: {
      '@ng-doc/core': path.join(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(repository, 'libs/utils/index.ts'),
    },
  });
  const compilerBundle = await readFile(factoryFile);
  const compilerBundleSha256 = createHash('sha256').update(compilerBundle).digest('hex');
  let compilerSourceMapSha256;
  if (profileEnabled) {
    const compilerSourceMap = await readFile(`${factoryFile}.map`);
    compilerSourceMapSha256 = createHash('sha256').update(compilerSourceMap).digest('hex');
    await Promise.all([
      writeFile(retainedCompilerBundleFile, compilerBundle),
      writeFile(retainedCompilerSourceMapFile, compilerSourceMap),
    ]);
  }
  const inputs = Object.keys(bundled.metafile.inputs).sort();
  const emittedImports = Object.values(bundled.metafile.outputs).flatMap(
    (output) => output.imports,
  );
  if (
    inputs.some((input) => /libs\/builder\/(engine\/|index\.ts$)/.test(input)) ||
    emittedImports.some((item) => /@ng-doc\/builder|@angular-devkit\/architect/.test(item.path))
  ) {
    throw new Error(
      'Main compiler bundle entered forbidden legacy engine/Builder root/Architect boundary',
    );
  }
  await writeFile(
    path.join(evidence, 'bundle.json'),
    JSON.stringify({ inputs, emittedImports }, null, 2),
  );
  await build({
    entryPoints: ['index.ts', 'entry.ts', 'protocol.ts'].map((file) =>
      path.join(repository, 'libs/builder/generator/worker', file),
    ),
    outdir: path.join(temporary, 'worker'),
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  const { createWorkerCompilationService } = await import(
    pathToFileURL(path.join(temporary, 'worker/index.js')).href
  );
  let compilationModuleUrl = pathToFileURL(factoryFile);
  if (profileEnabled) {
    const profileFactoryFile = path.join(temporary, 'compiler-profile.mjs');
    await writeFile(
      profileFactoryFile,
      `import { Session } from 'node:inspector';
import { writeFile } from 'node:fs/promises';
import { createCompilationService as createActualCompilationService } from './compiler.mjs';

const cpuProfileFile = ${JSON.stringify(cpuProfileFile)};
const runtimeFile = ${JSON.stringify(profileRuntimeFile)};
const preTransportFile = ${JSON.stringify(preTransportFile)};
const post = (session, method, params = {}) =>
  new Promise((resolve, reject) =>
    session.post(method, params, (error, result) => (error ? reject(error) : resolve(result))),
  );

const createSemanticCounts = () => ({
    full: 0,
    references: 0,
    fullFilePathEntries: 0,
    uniqueFullFilePaths: new Set(),
    fullScopeIds: new Set(),
    referenceScopeIds: new Set(),
  });
const addSemanticCounts = (counts, dependencies) => {
  for (const dependency of dependencies) {
    if (dependency?.kind === 'semantic') {
      counts.full += 1;
      counts.fullScopeIds.add(dependency.scopeId);
      for (const file of dependency.files ?? []) {
        counts.fullFilePathEntries += 1;
        counts.uniqueFullFilePaths.add(file);
      }
    } else if (dependency?.kind === 'semantic-reference') {
      counts.references += 1;
      counts.referenceScopeIds.add(dependency.scopeId);
    }
  }
};
const finishSemanticCounts = (counts) => ({
    full: counts.full,
    references: counts.references,
    fullFilePathEntries: counts.fullFilePathEntries,
    uniqueFullFilePaths: counts.uniqueFullFilePaths.size,
    fullScopeIds: [...counts.fullScopeIds].sort(),
    referenceScopeIds: [...counts.referenceScopeIds].sort(),
  });
const semanticCounts = (dependencies) => {
  const counts = createSemanticCounts();
  addSemanticCounts(counts, dependencies);
  return finishSemanticCounts(counts);
};

const resultStats = (result) => {
  const artifacts = result.candidate?.artifacts ?? [];
  let artifactBytesSum = 0;
  let artifactBytesMax = 0;
  let artifactBytesMaxId;
  const artifactSemanticCounts = createSemanticCounts();
  for (const artifact of artifacts) {
    const bytes = Buffer.byteLength(JSON.stringify(artifact));
    artifactBytesSum += bytes;
    if (bytes > artifactBytesMax) {
      artifactBytesMax = bytes;
      artifactBytesMaxId = artifact.id;
    }
    addSemanticCounts(artifactSemanticCounts, artifact.dependencies);
  }
  return {
    recordedAt: new Date().toISOString(),
    candidatePresent: Boolean(result.candidate),
    candidate: result.candidate
      ? {
          artifacts: artifacts.length,
          linkedContent: artifacts.reduce((sum, artifact) => sum + artifact.content.length, 0),
          searchRecords: artifacts.reduce((sum, artifact) => sum + artifact.searchRecords.length, 0),
          routes: artifacts.reduce((sum, artifact) => sum + artifact.routes.length, 0),
          apiList: artifacts.reduce((sum, artifact) => sum + artifact.apiList.length, 0),
          outputs: artifacts.reduce((sum, artifact) => sum + artifact.outputs.length, 0),
          globalKeywords: result.candidate.globalKeywords.length,
          remoteKeywordSnapshots: result.candidate.remoteKeywords.length,
          artifactSerializedBytes: {
            sum: artifactBytesSum,
            max: artifactBytesMax,
            maxArtifactId: artifactBytesMaxId,
          },
        }
      : undefined,
    semanticDependencies: {
      result: semanticCounts(result.dependencies),
      artifacts: finishSemanticCounts(artifactSemanticCounts),
    },
    diagnostics: result.diagnostics.length,
    whyRebuilt: result.whyRebuilt.length,
    memoryUsage: process.memoryUsage(),
    resourceUsage: process.resourceUsage(),
    wholeCandidateSerializationAttempted: false,
  };
};

export function createCompilationService(options) {
  const actual = createActualCompilationService(options);
  return {
    async compile(request, signal) {
      const session = new Session();
      session.connect();
      let profilerStarted = false;
      try {
        await post(session, 'Profiler.enable');
        await post(session, 'Profiler.start');
        profilerStarted = true;
        const result = await actual.compile(request, signal);
        await writeFile(preTransportFile, JSON.stringify(resultStats(result), null, 2));
        return result;
      } finally {
        try {
          if (profilerStarted) {
            const { profile } = await post(session, 'Profiler.stop');
            await writeFile(cpuProfileFile, JSON.stringify(profile));
            await writeFile(
              runtimeFile,
              JSON.stringify({
                pid: process.pid,
                execArgv: process.execArgv,
                execPath: process.execPath,
                node: process.version,
              }, null, 2),
            );
          }
          await post(session, 'Profiler.disable').catch(() => {});
        } finally {
          session.disconnect();
        }
      }
    },
    dispose() {
      return actual.dispose();
    },
  };
}
`,
    );
    compilationModuleUrl = pathToFileURL(profileFactoryFile);
  }
  proxy = createWorkerCompilationService({
    moduleUrl: compilationModuleUrl,
    startupTimeoutMs: 30_000,
    compileTimeoutMs: 300_000,
    factoryOptions: {
      projectId: 'ng-doc',
      workspaceRoot: repository,
      configFile,
      defaults: {
        docsRoot: path.join(repository, 'apps/ng-doc/docs'),
        tsConfig: productionTsConfig,
        outputRoot,
        cacheRoot,
      },
      templateRoot: path.join(repository, 'libs/builder/templates'),
      compilerVersion: 't10-main-smoke',
      toolchainDigest: `${process.version}-main-production-tsconfig`,
    },
  });
  const started = performance.now();
  console.log(
    'Compiling the actual main documentation project in a disposable process (300 second deadline).',
  );
  progress = setInterval(
    () =>
      console.log(
        `Compilation still running after ${Math.round((performance.now() - started) / 1000)} seconds.`,
      ),
    30_000,
  );
  const result = await proxy.compile(
    { generation: 1, mode: 'production', changes: [] },
    new AbortController().signal,
  );
  clearInterval(progress);
  const artifacts = result.candidate?.artifacts ?? [];
  const search = artifacts.flatMap((artifact) => artifact.searchRecords);
  const routes = artifacts.flatMap((artifact) => artifact.routes);
  const outputs = artifacts.flatMap((artifact) => artifact.outputs);
  const keywordValues = [
    ...(result.candidate?.remoteKeywords.flatMap((snapshot) => snapshot.keywords) ?? []),
    ...(result.candidate?.globalKeywords ?? []),
    ...artifacts.flatMap((artifact) => artifact.exportedKeywords),
  ];
  const counts = {};
  for (const diagnostic of result.diagnostics)
    counts[diagnostic.code] = (counts[diagnostic.code] ?? 0) + 1;
  const roles = {};
  for (const output of outputs) roles[output.role] = (roles[output.role] ?? 0) + 1;
  const summary = {
    runtime: process.version,
    startedAt,
    startedRevision,
    compilerBundleSha256,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim(),
    sourceConfig,
    productionTsConfig,
    configuredSemanticTsConfig: path.join(repository, 'apps/ng-doc/tsconfig.app.json'),
    configurationOverride:
      'None. Actual configuration tsConfig takes precedence over the production host/default tsConfig.',
    compileOnly: true,
    durationMs: Math.round(performance.now() - started),
    candidatePresent: Boolean(result.candidate),
    candidateRevision: result.candidate?.revision,
    errors: result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
    warnings: result.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length,
    diagnosticsByCode: counts,
    artifacts: artifacts.length,
    apiDeclarations: artifacts.flatMap((artifact) => artifact.apiList).length,
    routes: routes.length,
    routesWithModules: routes.filter((route) => route.modulePath).length,
    searchRecords: search.length,
    uniqueKeywords: new Set(keywordValues.map((keyword) => keyword.key)).size,
    remoteKeywords: result.candidate?.remoteKeywords.map((snapshot) => ({
      loaderId: snapshot.loaderId,
      count: snapshot.keywords.length,
    })),
    outputs: outputs.length,
    outputsByRole: roles,
    dependencies: result.dependencies.length,
    whyRebuilt: result.whyRebuilt.length,
    acceptedLegacyReference: { prerenderedPages: 650, keywords: 4857, searchRecords: 1289 },
    comparisonNote:
      'Route/artifact counts and legacy prerendered URL counts are distinct metrics; no equivalence is assumed.',
  };
  if (profileEnabled) {
    await compressCpuProfile(cpuProfileFile, compressedCpuProfileFile);
    await rm(cpuProfileFile);
    const rawProfile = await readCpuProfile(compressedCpuProfileFile);
    const runtime = JSON.parse(await readFile(profileRuntimeFile, 'utf8'));
    const preTransport = JSON.parse(await readFile(preTransportFile, 'utf8'));
    if (!Array.isArray(runtime.execArgv) || runtime.execArgv.length !== 0) {
      throw new Error(`Profiled compilation worker inherited execArgv: ${runtime.execArgv}`);
    }
    const profileSummary = summarizeCpuProfile(rawProfile, temporary);
    const sourceInputDigest = createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
    const completedRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim();
    await writeFile(
      path.join(profileEvidence, 'summary.json'),
      JSON.stringify(profileSummary, null, 2),
    );
    await writeFile(
      path.join(profileEvidence, 'provenance.json'),
      JSON.stringify(
        {
          startedAt,
          completedAt: new Date().toISOString(),
          startedRevision,
          completedRevision,
          runtime,
          compilerSource: path.join(repository, 'libs/builder/generator/compiler/index.ts'),
          compilerBundleSha256,
          compilerSourceMapSha256,
          retainedCompilerBundle: path.relative(repository, retainedCompilerBundleFile),
          retainedCompilerSourceMap: path.relative(repository, retainedCompilerSourceMapFile),
          sourceInputDigest,
          sourceInputCount: inputs.length,
          sourceInputs: inputs,
          profile: path.relative(repository, compressedCpuProfileFile),
          compression: 'gzip',
          preTransport: path.relative(repository, preTransportFile),
          profiler: 'node:inspector Session Profiler',
        },
        null,
        2,
      ),
    );
    summary.profile = {
      profile: path.relative(repository, compressedCpuProfileFile),
      summary: path.relative(repository, path.join(profileEvidence, 'summary.json')),
      provenance: path.relative(repository, path.join(profileEvidence, 'provenance.json')),
      preTransport: path.relative(repository, preTransportFile),
      workerPid: runtime.pid,
      workerExecArgv: runtime.execArgv,
      sampledDurationMs: profileSummary.sampledDurationMs,
      candidateStats: preTransport.candidate,
    };
  }
  try {
    await stat(outputRoot);
    summary.outputDirectoryExists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    summary.outputDirectoryExists = false;
  }
  await writeFile(path.join(evidence, 'summary.json'), JSON.stringify(summary, null, 2));
  await writeFile(path.join(evidence, 'search.json'), JSON.stringify(search, null, 2));
  await writeFile(path.join(evidence, 'keywords.json'), JSON.stringify(keywordValues, null, 2));
  await writeFile(
    path.join(evidence, 'diagnostics.json'),
    JSON.stringify(result.diagnostics, null, 2),
  );
  await writeFile(
    path.join(evidence, 'artifacts.json'),
    JSON.stringify(
      artifacts.map((artifact) => ({
        id: artifact.id,
        identity: artifact.identity,
        routes: artifact.routes,
        searchRecords: artifact.searchRecords.length,
        exportedKeywords: artifact.exportedKeywords.length,
        outputs: artifact.outputs.map(({ path, role, digest }) => ({ path, role, digest })),
      })),
      null,
      2,
    ),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (!result.candidate || summary.errors || summary.outputDirectoryExists) process.exitCode = 1;
} finally {
  clearInterval(progress);
  await proxy?.dispose();
  await rm(temporary, { recursive: true, force: true });
}

function summarizeCpuProfile(profile, temporaryRoot) {
  if (
    !profile ||
    !Array.isArray(profile.nodes) ||
    !Array.isArray(profile.samples) ||
    !Array.isArray(profile.timeDeltas)
  ) {
    throw new Error('Inspector returned an invalid CPU profile');
  }
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parents.set(child, node.id);
  }
  const rows = new Map();
  const rowFor = (node) => {
    const frame = node.callFrame ?? {};
    const name = frame.functionName || '(anonymous)';
    const url = String(frame.url || '(native)').replaceAll(temporaryRoot, '<temporary>');
    const line = Number(frame.lineNumber ?? -1) + 1;
    const column = Number(frame.columnNumber ?? -1) + 1;
    const key = `${name}\u0000${url}\u0000${line}\u0000${column}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        functionName: name,
        url,
        line,
        column,
        selfMicros: 0,
        cumulativeMicros: 0,
        samples: 0,
      };
      rows.set(key, row);
    }
    return { key, row };
  };
  let sampledMicros = 0;
  for (let index = 0; index < profile.samples.length; index += 1) {
    const delta = Number(profile.timeDeltas[index] ?? 0);
    if (!Number.isFinite(delta) || delta < 0) continue;
    sampledMicros += delta;
    const leaf = nodes.get(profile.samples[index]);
    if (!leaf) continue;
    const self = rowFor(leaf).row;
    self.selfMicros += delta;
    self.samples += 1;
    const visitedNodes = new Set();
    const visitedFrames = new Set();
    let cursor = leaf;
    while (cursor && !visitedNodes.has(cursor.id)) {
      visitedNodes.add(cursor.id);
      const current = rowFor(cursor);
      if (!visitedFrames.has(current.key)) {
        current.row.cumulativeMicros += delta;
        visitedFrames.add(current.key);
      }
      cursor = nodes.get(parents.get(cursor.id));
    }
  }
  const materialize = (row) => ({
    functionName: row.functionName,
    url: row.url,
    line: row.line,
    column: row.column,
    selfMs: Number((row.selfMicros / 1000).toFixed(3)),
    cumulativeMs: Number((row.cumulativeMicros / 1000).toFixed(3)),
    selfPercent: Number(((row.selfMicros / Math.max(sampledMicros, 1)) * 100).toFixed(3)),
    cumulativePercent: Number(
      ((row.cumulativeMicros / Math.max(sampledMicros, 1)) * 100).toFixed(3),
    ),
    samples: row.samples,
  });
  const functions = [...rows.values()].filter(
    (row) => row.functionName !== '(idle)' && row.functionName !== '(program)',
  );
  const topSelf = [...functions]
    .sort(
      (left, right) =>
        right.selfMicros - left.selfMicros || left.functionName.localeCompare(right.functionName),
    )
    .slice(0, 25)
    .map(materialize);
  const topCumulative = [...functions]
    .sort(
      (left, right) =>
        right.cumulativeMicros - left.cumulativeMicros ||
        left.functionName.localeCompare(right.functionName),
    )
    .slice(0, 25)
    .map(materialize);
  return {
    sampledDurationMs: Number((sampledMicros / 1000).toFixed(3)),
    wallDurationMs: Number(((profile.endTime - profile.startTime) / 1000).toFixed(3)),
    sampleCount: profile.samples.length,
    nodeCount: profile.nodes.length,
    topSelf,
    topCumulative,
  };
}

async function compressCpuProfile(source, destination) {
  const temporaryDestination = `${destination}.tmp`;
  await rm(temporaryDestination, { force: true });
  try {
    await pipeline(
      createReadStream(source),
      createGzip({ level: zlibConstants.Z_BEST_COMPRESSION }),
      createWriteStream(temporaryDestination, { flags: 'wx' }),
    );
    await rm(destination, { force: true });
    await rename(temporaryDestination, destination);
  } catch (error) {
    await rm(temporaryDestination, { force: true });
    throw error;
  }
}

async function readCpuProfile(file) {
  const bytes = await readFile(file);
  const decoded = file.endsWith('.gz') ? await promisify(gunzip)(bytes) : bytes;
  return JSON.parse(decoded.toString('utf8'));
}
