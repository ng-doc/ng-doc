import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const observedModules = Object.freeze({
  compiler: ['libs/builder/generator/compiler/index.ts', ['createCompilationService']],
  discovery: ['libs/builder/generator/discovery/index.ts', ['createDiscoveryServices']],
  semantic: ['libs/builder/generator/semantic/semantic-service.ts', ['createSemanticService']],
  content: ['libs/builder/generator/content/content-compiler.ts', ['GeneratorContentCompiler']],
  artifacts: [
    'libs/builder/generator/artifacts/index.ts',
    ['createArtifactCache', 'createOutputCommitter'],
  ],
  graph: ['libs/builder/generator/graph/index.ts', ['createDependencyRefresher']],
});
const runtime = fileURLToPath(new URL('./runtime.mjs', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function captureObserverSources(root) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(observedModules).map(async ([name, [file]]) => [
        name,
        { path: file, sha256: sha(await readFile(path.join(root, file))) },
      ]),
    ),
  );
}

/** Public esbuild resolver composition; no source text rewriting or runtime monkey patching. */
export function createWorkObserverPlugin({
  root,
  expectedSources,
  requiredModules = Object.keys(observedModules),
}) {
  const targets = new Map(
    Object.entries(observedModules).map(([name, [file, names]]) => [
      path.resolve(root, file),
      { name, names },
    ]),
  );
  for (const name of requiredModules)
    if (!observedModules[name]) throw new Error(`Unknown required observer module: ${name}`);
  const seen = new Set();
  return {
    name: 'ngdoc-benchmark-work-observer',
    setup(builder) {
      builder.onStart(async () => {
        seen.clear();
        const actual = await captureObserverSources(root);
        for (const [name, item] of Object.entries(actual)) {
          if (
            expectedSources?.[name]?.path !== item.path ||
            expectedSources[name].sha256 !== item.sha256
          ) {
            throw new Error(`Observer source guard mismatch: ${name}`);
          }
        }
      });
      builder.onResolve({ filter: /^ngdoc-observer-original:/ }, (args) => ({
        path: args.path.slice('ngdoc-observer-original:'.length),
        namespace: 'file',
      }));
      builder.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData?.ngDocObserverResolving || args.namespace === 'ngdoc-observer') return;
        const resolved = await builder.resolve(args.path, {
          importer: args.importer,
          namespace: args.namespace,
          resolveDir: args.resolveDir,
          kind: args.kind,
          pluginData: { ...args.pluginData, ngDocObserverResolving: true },
        });
        if (resolved.errors.length || resolved.external || !targets.has(resolved.path)) return;
        // Entry points must also be wrapped, so direct CLI and child compilation cannot bypass it.
        return { path: resolved.path, namespace: 'ngdoc-observer' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'ngdoc-observer' }, (args) => {
        const { name, names } = targets.get(args.path);
        seen.add(name);
        const source = JSON.stringify(`ngdoc-observer-original:${args.path}`);
        return {
          loader: 'js',
          resolveDir: path.dirname(args.path),
          contents: [
            `export * from ${source};`,
            `import * as original from ${source};`,
            `import { observeExport } from ${JSON.stringify(runtime)};`,
            ...names.map(
              (symbol) =>
                `export const ${symbol} = observeExport(${JSON.stringify(symbol)}, original.${symbol});`,
            ),
          ].join('\n'),
        };
      });
      builder.onEnd((result) => {
        if (result.errors.length) return;
        const missing = requiredModules.filter((name) => !seen.has(name));
        if (missing.length)
          return { errors: [{ text: `Observer modules not reached: ${missing.join(', ')}` }] };
      });
    },
  };
}
