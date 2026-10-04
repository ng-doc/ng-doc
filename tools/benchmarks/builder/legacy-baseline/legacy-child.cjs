/*
 * One process owns one legacy build.  The legacy engine has module globals for
 * stores, caches and the watcher, so keeping this runner out of the test runner's process
 * is part of the harness contract rather than an implementation detail.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const { Project } = require('ts-morph');
const overlay = process.env.NGDOC_LEGACY_OVERLAY;
if (!overlay) throw new Error('NGDOC_LEGACY_OVERLAY is required');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === '@ng-doc/builder') return path.join(overlay, 'index.js');
  return originalResolve.call(this, request, parent, isMain, options);
};
const distEngine = path.join(overlay, 'engine/build-ng-doc.js');
const distCore = path.resolve(__dirname, '../../../../dist/libs/core/index.js');

if (!fs.existsSync(distEngine) || !fs.existsSync(distCore))
  throw new Error('Prepared legacy overlay or built core is missing.');

const { buildNgDoc } = require(distEngine);
const { GLOBALS } = require('@ng-doc/builder');
const diagnostics = [];
const originalError = console.error;
const originalLog = console.log;
console.error = (...args) => {
  diagnostics.push(args.map(String).join(' '));
  originalError(...args);
};
// Progress belongs to diagnostics; stdout is a line-delimited machine protocol
// for the native-watch parent.
console.log = (...args) => originalError(...args);

const [root, outDir, mode = 'once'] = process.argv.slice(2);

if (!root || !outDir) {
  throw new Error('usage: legacy-generator-child.cjs <fixture-root> <output-root>');
}

// The legacy esbuild and glob helpers resolve fixture entry imports/includes
// relative to the consumer workspace, not this repository's test runner cwd.
process.chdir(root);
GLOBALS.watch = mode === 'watch';
// Observe the real legacy subscription without replacing its backend/events.
// A native marker acknowledgement drains fixture-creation events before edits.
let nativeBarrier = mode !== 'watch';
let markerSent = false;
const marker = path.join(root, '.ngdoc-harness-native-ready');
if (mode === 'watch') {
  const parcel = require('@parcel/watcher');
  const subscribe = parcel.subscribe;
  parcel.subscribe = (directory, callback, options) =>
    subscribe(
      directory,
      (error, events) => {
        if (events?.some((event) => event.path === marker)) nativeBarrier = true;
        if (events?.some((event) => event.path.startsWith(path.join(root, 'docs') + path.sep))) {
          process.stdout.write(
            JSON.stringify({
              event: 'native',
              files: capture(),
              diagnostics,
              nativeEvents: events,
            }) + '\n',
          );
        }
        callback(error, events);
      },
      options,
    );
}

const context = {
  tsConfig: path.join(root, 'tsconfig.json'),
  project: new Project({ tsConfigFilePath: path.join(root, 'tsconfig.json') }),
  config: {
    cache: process.env.NGDOC_TEST_CACHE === '1',
    docsPath: path.join(root, 'docs'),
    routePrefix: 'docs',
    keywords: { keywords: { FixtureKeyword: { url: 'https://example.test/keyword' } } },
    guide: { anchorHeadings: ['h1', 'h2', 'h3'] },
  },
  context: { workspaceRoot: root, target: { project: 'fixture' } },
  inlineStyleLanguage: 'CSS',
  cachedFiles: [path.join(root, 'ng-doc.config.ts')],
  docsPath: path.join(root, 'docs'),
  outDir,
  outApiDir: path.join(outDir, 'api'),
  outGuidesDir: path.join(outDir, 'guides'),
  outAssetsDir: path.join(outDir, 'assets'),
};

function files(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}

function capture() {
  const workspace = path.resolve(root);
  const raw = files(outDir)
    .sort()
    .map((file) => ({ file, content: fs.readFileSync(file, 'utf8') }));
  const generatedBindings = new Set();
  for (const { content } of raw) {
    for (const match of content.matchAll(/\bimport\s+(entry[a-z0-9]+)\s+from\b/g))
      generatedBindings.add(match[1]);
  }
  return raw.map(({ file, content }) => {
    let normalized = content.replaceAll(workspace.split(path.sep).join('/'), '<WORKSPACE>');
    for (const binding of generatedBindings) {
      normalized = normalized.replace(new RegExp(`\\b${binding}\\b`, 'g'), '<ENTRY_ID>');
    }
    return {
      path: path.relative(outDir, file).split(path.sep).join('/'),
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      mtimeMs: fs.statSync(file).mtimeMs,
      // Only bindings proven to be generated imports are normalized. Routes,
      // search records, HTML and every non-generated identifier remain raw.
      normalized,
    };
  });
}

let emitted = false;
let emissions = 0;
let failure;
const subscription = buildNgDoc(context).subscribe({
  next() {
    emitted = true;
    emissions++;
  },
  error(error) {
    failure = error;
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  },
});

const requiredArtifacts = [
  'routes.ts',
  'context.ts',
  'assets/indexes.json',
  'assets/keywords.json',
  'guides/guide/index/page.ts',
  'guides/guide/second/page.ts',
  'guides/guide/page.ts',
  'guides/guide/playgrounds.ts',
  'guides/guide/demo-assets.ts',
  'api/page.ts',
];
const deadline = Date.now() + 5_000;
let lastSignature = '';
let lastEmissions = 0;
let ready = false;

function finish() {
  subscription.unsubscribe();
  const snapshot = capture();
  if (failure) return fail(failure, snapshot);
  if (
    !emitted ||
    !requiredArtifacts.every((file) => snapshot.some((entry) => entry.path === file))
  ) {
    return fail(new Error('legacy generator did not reach observable output state'), snapshot);
  }
  process.stdout.write(JSON.stringify({ files: snapshot, diagnostics, emissions }));
  console.log = originalLog;
}

function fail(error, snapshot) {
  process.stderr.write(
    `${error.stack || error}\nobserved artifacts: ${JSON.stringify(snapshot.map((entry) => entry.path))}\n`,
  );
  process.exit(1);
}

(function awaitObservedOutput() {
  const snapshot = capture();
  if (emitted && requiredArtifacts.every((file) => snapshot.some((entry) => entry.path === file))) {
    // The output invariants, rather than elapsed time, define readiness.
    if (mode === 'once') return finish();
    if (!markerSent) {
      fs.writeFileSync(marker, 'ready');
      markerSent = true;
    }
    if (!nativeBarrier) {
      if (Date.now() >= deadline)
        return fail(new Error('native readiness marker was not observed'), snapshot);
      return setTimeout(awaitObservedOutput, 25);
    }
    const signature = JSON.stringify(
      snapshot.map((entry) => [entry.path, entry.sha256, entry.mtimeMs]),
    );
    if (!ready || (signature !== lastSignature && emissions > lastEmissions)) {
      process.stdout.write(
        `${JSON.stringify({ event: ready ? 'change' : 'ready', files: snapshot, diagnostics, emissions })}\n`,
      );
      ready = true;
      lastSignature = signature;
      lastEmissions = emissions;
    }
    return setTimeout(awaitObservedOutput, 25);
  }
  if (Date.now() >= deadline) {
    if (mode === 'watch')
      return fail(new Error('legacy watch did not reach initial artifact readiness'), snapshot);
    return finish();
  }
  setTimeout(awaitObservedOutput, 25);
})();
