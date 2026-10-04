import { cp, mkdtemp, mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { createNgDocAngularPlugins as angular } from '../../dist/libs/builder/generator/vite/angular/index.js';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.env.NGDOC_LOCAL_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('NGDOC_LOCAL_PORT must be 1–65535.');
// Physical generated files are the only development content. NGDOC_LOCAL_CONTENT=file is still
// accepted so that existing callers keep working; any other value fails.
if ((process.env.NGDOC_LOCAL_CONTENT ?? 'file') !== 'file')
  throw new Error('NGDOC_LOCAL_CONTENT supports only file; the virtual content mode was removed.');
const readyFile = process.env.NGDOC_LOCAL_READY ?? path.join(root, 'tmp/ngdoc-local-ready.json');
await mkdir(path.join(root, 'tmp'), { recursive: true });
// NGDOC_LOCAL_STATE_DIR keeps the generated/cache/Vite state across restarts (warm start);
// by default every start uses a fresh temporary directory that is removed on exit.
const persistentState = process.env.NGDOC_LOCAL_STATE_DIR
  ? path.resolve(process.env.NGDOC_LOCAL_STATE_DIR)
  : undefined;
if (persistentState) await mkdir(persistentState, { recursive: true });
const fixture = persistentState ?? (await mkdtemp(path.join(root, 'tmp/ngdoc-local-')));
const traceFile = process.env.NGDOC_LOCAL_TRACE;
if (traceFile) await mkdir(path.dirname(traceFile), { recursive: true });
const started = Date.now();
const trace = (event, details = {}) => {
  if (traceFile)
    appendFileSync(
      traceFile,
      JSON.stringify({ event, elapsedMs: Date.now() - started, ...details }) + '\n',
    );
};
function tracedAngular(options) {
  const plugins = angular(options);
  if (!traceFile) return plugins;
  for (const plugin of plugins) {
    for (const name of ['configureServer', 'buildStart', 'handleHotUpdate', 'hotUpdate']) {
      const original = plugin[name];
      if (!original) continue;
      const handler = typeof original === 'function' ? original : original.handler;
      const traced = async function (...args) {
        const details = { plugin: plugin.name, hook: name, file: args[0]?.file };
        trace('angular-hook-start', details);
        try {
          return await handler.apply(this, args);
        } finally {
          trace('angular-hook-end', details);
        }
      };
      plugin[name] = typeof original === 'function' ? traced : { ...original, handler: traced };
    }
  }
  return plugins;
}
let server;
let closing;
const closeServer = () => (closing ??= server?.close() ?? Promise.resolve());
let stopTrace;
let stopping = false;
let stop;
const stopped = new Promise((resolve) => {
  stop = resolve;
});
const requestStop = () => {
  stopping = true;
  stop();
  if (server)
    void closeServer().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
};
process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);
let ownsReady = false;
try {
  const generated = path.join(fixture, 'generated');
  const source = path.join(root, 'apps/ng-doc/src');
  const put = async (name, value) => {
    const target = path.join(fixture, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value);
    return target;
  };
  const appPaths = JSON.parse(
    await readFile(path.join(root, 'apps/ng-doc/tsconfig.vite.json'), 'utf8'),
  ).compilerOptions.paths;
  appPaths['@ng-doc/generated'] = [path.join(generated, 'index.ts')];
  const tsconfig = await put(
    'tsconfig.json',
    JSON.stringify(
      {
        extends: path.join(root, 'apps/ng-doc/tsconfig.build.json'),
        compilerOptions: {
          module: 'esnext',
          moduleResolution: 'bundler',
          paths: appPaths,
          types: ['node'],
          esModuleInterop: true,
        },
        files: [path.join(source, 'main.ts'), path.join(fixture, 'entry.ts')],
        include: [path.join(source, '**/*.d.ts')],
      },
      null,
      2,
    ),
  );
  const config = await put(
    'ng-doc.config.ts',
    `import config from ${JSON.stringify(path.join(root, 'apps/ng-doc/ng-doc.config.ts'))}; export default {...config, outDir: undefined, cache: true};\n`,
  );
  await put('package.json', '{"private":true,"type":"module"}\n');
  await put(
    'entry.ts',
    `import ${JSON.stringify(path.join(source, 'styles.scss'))}; import ${JSON.stringify(path.join(source, 'main.ts'))};\n`,
  );
  await put(
    'index.html',
    (await readFile(path.join(source, 'index.html'), 'utf8')).replace(
      '</body>',
      '<script type="module" src="/entry.ts"></script></body>',
    ),
  );
  await cp(path.join(source, 'assets'), path.join(fixture, 'public/assets'), { recursive: true });
  for (const name of ['app', 'ui-kit'])
    if (existsSync(path.join(root, `dist/libs/${name}/assets`)))
      await cp(
        path.join(root, `dist/libs/${name}/assets`),
        path.join(fixture, `public/assets/ng-doc/${name}`),
        { recursive: true },
      );
  const linkedCoreImports = new Set(['@ng-doc/core']);
  for (const library of ['app', 'ui-kit'])
    for (const name of await readdir(path.join(root, `dist/libs/${library}/fesm2022`)))
      if (name.endsWith('.mjs'))
        for (const match of (
          await readFile(path.join(root, `dist/libs/${library}/fesm2022`, name), 'utf8')
        ).matchAll(/['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g))
          linkedCoreImports.add(match[1]);
  const { createNgDocVitePlugin } = await import(
    pathToFileURL(path.join(root, 'dist/libs/builder/generator/vite/index.js')).href
  );
  server = await createServer({
    root: fixture,
    configFile: false,
    cacheDir: path.join(fixture, 'vite-cache'),
    plugins: [
      {
        name: 'ng-doc-local-startup',
        enforce: 'pre',
        configureServer(value) {
          server = value;
          trace('server-attached');
          if (!traceFile) return;
          const counts = {};
          const recent = [];
          const observe = (kind, file) => {
            counts[kind] = (counts[kind] ?? 0) + 1;
            recent.push({ kind, file });
            if (recent.length > 8) recent.shift();
          };
          value.watcher.on('all', observe);
          const timer = setInterval(() => trace('watch-events', { counts, recent }), 1000);
          timer.unref();
          stopTrace = () => {
            clearInterval(timer);
            value.watcher.off('all', observe);
          };
        },
      },
      createNgDocVitePlugin({
        analogLiveReload: true,
        angularPlugins: tracedAngular({
          tsconfig,
          workspaceRoot: root,
          disableTypeChecking: false,
          jit: false,
          liveReload: true,
          inlineStylesExtension: 'scss',
        }),
        angularComponentProbe: path.join(source, 'app/app.component.ts'),
        generator: {
          projectId: 'ng-doc-local',
          workspaceRoot: root,
          configFile: config,
          defaults: {
            docsRoot: path.join(root, 'apps/ng-doc/docs'),
            tsConfig: tsconfig,
            outputRoot: generated,
            cacheRoot: path.join(fixture, 'cache'),
          },
        },
      }),
    ],
    optimizeDeps: { include: [...linkedCoreImports].sort() },
    resolve: {
      alias: [{ find: '@ng-doc/core', replacement: path.join(root, 'dist/libs/core') }],
      dedupe: [
        '@angular/core',
        '@angular/common',
        '@angular/compiler',
        '@angular/platform-browser',
        '@angular/router',
      ],
    },
    css: { preprocessorOptions: { scss: { loadPaths: [root] } } },
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root] } },
  });

  trace('server-created');
  if (!stopping) {
    await server.listen();
    if (!stopping) {
      const url = server.resolvedUrls.local[0];
      await mkdir(path.dirname(readyFile), { recursive: true });
      await writeFile(readyFile, `${JSON.stringify({ url, fixture, pid: process.pid })}\n`);
      ownsReady = true;
      trace('server-listening', { url });
      console.log(`NgDoc local app: ${url}`);
      await stopped;
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    if (server) await closeServer();
  } catch (error) {
    console.error('NgDoc server cleanup failed:', error);
    process.exitCode = 1;
  } finally {
    if (ownsReady) {
      try {
        const ready = JSON.parse(await readFile(readyFile, 'utf8'));
        if (ready.fixture === fixture && ready.pid === process.pid) await unlink(readyFile);
      } catch (error) {
        if (error.code !== 'ENOENT') console.error('NgDoc readiness cleanup failed:', error);
      }
    }
    stopTrace?.();
    if (!persistentState) await rm(fixture, { recursive: true, force: true });
    process.removeListener('SIGINT', requestStop);
    process.removeListener('SIGTERM', requestStop);
  }
}
