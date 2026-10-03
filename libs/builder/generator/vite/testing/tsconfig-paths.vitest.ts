import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type Plugin, type Rollup, type ViteDevServer, build, createServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  angularTsconfigPath,
  createTsconfigPathsPlugin,
  matchesPathMapping,
  NG_DOC_TSCONFIG_PATHS_PLUGIN,
  pathMappingTargets,
  readTsconfigPaths,
} from '../tsconfig-paths';

const temporary: string[] = [];
const servers: ViteDevServer[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function directory(): Promise<{
  root: string;
  put(file: string, text: string): Promise<void>;
}> {
  // Outside the repository: no node_modules above the fixture resolves anything.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ng-doc-tsconfig-paths-')));
  temporary.push(root);
  const put = async (file: string, text: string) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  };
  return { root, put };
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The two shapes of the open-source trial: an Angular CLI workspace whose secondary entry points
 * are mapped with a wildcard (`ngx-oneforall/*`), and an Nx workspace whose library is mapped
 * exactly in `tsconfig.base.json`, which the application's tsconfig extends. Plus a library built
 * into `dist` (as `ng generate library` maps it), a pattern that also matches an npm package, a
 * declaration-only mapping and an alias.
 */
async function workspace() {
  const { root, put } = await directory();
  await put(
    'tsconfig.base.json',
    json({
      compilerOptions: {
        module: 'preserve',
        moduleResolution: 'bundler',
        target: 'es2022',
        paths: {
          'ngx-oneforall/*': ['projects/ngx-oneforall-lib/*/src/public_api.ts'],
          '@klerick/ng-pixijs': ['libs/ng-pixijs/src/index.ts'],
          'dist-lib': ['./dist/dist-lib'],
          '@scope/*': ['libs/scope/*'],
          'types-only': ['types/only'],
          linked: ['dist/linked/index'],
          aliased: ['libs/not-this.ts'],
        },
      },
    }),
  );
  await put(
    'apps/docs/tsconfig.app.json',
    json({ extends: '../../tsconfig.base.json', files: ['src/main.ts'] }),
  );
  await put(
    'projects/ngx-oneforall-lib/services/history/src/public_api.ts',
    `export * from './history';\n`,
  );
  await put(
    'projects/ngx-oneforall-lib/services/history/src/history.ts',
    `export const history = { marker: 'WILDCARD_LIB' };\n`,
  );
  await put('libs/ng-pixijs/src/index.ts', `export const pixi: string = 'EXACT_LIB';\n`);
  await put(
    'dist/dist-lib/package.json',
    json({ name: 'dist-lib', module: 'fesm2022/dist-lib.mjs', typings: 'index.d.ts' }),
  );
  await put('dist/dist-lib/index.d.ts', 'export declare const built: string;\n');
  await put('dist/dist-lib/fesm2022/dist-lib.mjs', `export const built = 'DIST_LIB';\n`);
  await put(
    'node_modules/@scope/real/package.json',
    json({ name: '@scope/real', main: 'index.js' }),
  );
  await put('node_modules/@scope/real/index.js', `export const real = 'NPM_PACKAGE';\n`);
  await put('node_modules/@scope/real/index.d.ts', 'export declare const real: string;\n');
  await put('types/only.d.ts', 'export declare const only: string;\n');
  // A built CommonJS library that is also installed: the package wins over its mapped folder.
  await put('dist/linked/index.d.ts', 'export declare const linked: string;\n');
  await put('dist/linked/index.js', `exports.linked = 'DIST_COPY';\n`);
  await put('node_modules/linked/package.json', json({ name: 'linked', module: 'index.mjs' }));
  await put('node_modules/linked/index.mjs', `export const linked = 'LINKED_PACKAGE';\n`);
  await put('libs/aliased.ts', `export const aliased = 'ALIASED';\n`);
  await put('libs/not-this.ts', `export const aliased = 'MAPPED';\n`);
  await put(
    'apps/docs/src/main.ts',
    [
      `import { history } from 'ngx-oneforall/services/history';`,
      `import { history as same } from '../../../projects/ngx-oneforall-lib/services/history/src/history';`,
      `import { pixi } from '@klerick/ng-pixijs';`,
      `import { built } from 'dist-lib';`,
      `import { real } from '@scope/real';`,
      `import { aliased } from 'aliased';`,
      `import { linked } from 'linked';`,
      `console.log(history === same, history.marker, pixi, built, real, aliased, linked);`,
      '',
    ].join('\n'),
  );
  return {
    root,
    put,
    tsconfig: path.join(root, 'apps/docs/tsconfig.app.json'),
    main: path.join(root, 'apps/docs/src/main.ts'),
  };
}

function code(output: Awaited<ReturnType<typeof build>>): string {
  return (Array.isArray(output) ? output : [output])
    .flatMap((item) => (item as Rollup.RollupOutput).output)
    .map((chunk) => (chunk.type === 'chunk' ? chunk.code : ''))
    .join('\n');
}

function viteBuild(
  fixture: Awaited<ReturnType<typeof workspace>>,
  plugins: Plugin[],
  ssr: boolean = false,
): ReturnType<typeof build> {
  return build({
    root: path.join(fixture.root, 'apps/docs'),
    configFile: false,
    logLevel: 'silent',
    plugins,
    resolve: { alias: { aliased: path.join(fixture.root, 'libs/aliased.ts') } },
    build: {
      write: false,
      minify: false,
      ...(ssr ? { ssr: fixture.main } : { rollupOptions: { input: fixture.main } }),
    },
    ...(ssr ? { ssr: { noExternal: true } } : {}),
  });
}

describe('tsconfig paths in the Vite engine', () => {
  it('fails to resolve path-mapped imports without the plugin (the trial failure)', async () => {
    const fixture = await workspace();
    await expect(viteBuild(fixture, [])).rejects.toThrow(/failed to resolve import/i);
  });

  it('builds the browser and server bundles with wildcard, exact and dist mappings', async () => {
    const fixture = await workspace();
    for (const ssr of [false, true]) {
      const output = code(
        await viteBuild(fixture, [createTsconfigPathsPlugin(fixture.tsconfig)], ssr),
      );
      for (const marker of [
        'WILDCARD_LIB',
        'EXACT_LIB',
        'DIST_LIB',
        'NPM_PACKAGE',
        'ALIASED',
        'LINKED_PACKAGE',
      ]) {
        expect(output, `${marker} (ssr: ${ssr})`).toContain(marker);
      }
      // The mapped and the relative import are one module, as for the Angular CLI.
      expect(output.match(/WILDCARD_LIB/g)).toHaveLength(1);
      // A Vite alias wins over a mapping.
      expect(output).not.toContain('MAPPED');
      expect(output).not.toContain('DIST_COPY');
    }
  });

  it('resolves in the development server and reads an edited tsconfig again', async () => {
    const fixture = await workspace();
    const server = await createServer({
      root: path.join(fixture.root, 'apps/docs'),
      cacheDir: path.join(fixture.root, 'node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      plugins: [createTsconfigPathsPlugin(() => fixture.tsconfig)],
      server: { middlewareMode: true, fs: { allow: [fixture.root] } },
      optimizeDeps: { noDiscovery: true },
    });
    servers.push(server);
    const container = server.environments.client.pluginContainer;
    const history = path.join(
      fixture.root,
      'projects/ngx-oneforall-lib/services/history/src/public_api.ts',
    );
    const resolve = async (source: string, importer?: string) =>
      (await container.resolveId(source, importer))?.id;
    expect(await resolve('ngx-oneforall/services/history', fixture.main)).toBe(history);
    // An importer that is no file (a virtual module), or none, resolves against the tsconfig.
    expect(await resolve('ngx-oneforall/services/history', '\0virtual:entry')).toBe(history);
    expect(await resolve('ngx-oneforall/services/history')).toBe(history);
    expect(await resolve('@klerick/ng-pixijs', `${fixture.main}?v=1`)).toBe(
      path.join(fixture.root, 'libs/ng-pixijs/src/index.ts'),
    );
    // Packages never use the application's mappings.
    expect(
      await resolve(
        '@klerick/ng-pixijs',
        path.join(fixture.root, 'node_modules/@scope/real/index.js'),
      ),
    ).toBeUndefined();
    // Not found, or found only as declarations: left to Vite, which does not find it either.
    expect(await resolve('ngx-oneforall/missing', fixture.main)).toBeUndefined();
    expect(await resolve('types-only', fixture.main)).toBeUndefined();
    const transformed = await server.environments.client.transformRequest('/src/main.ts');
    expect(transformed?.code).toContain('/@fs/');

    // Another file changing keeps the parsed tsconfig. Checked before the tsconfig is rewritten:
    // the server's real watcher reports that write on its own, and may do so first on Linux.
    await fixture.put('libs/next/index.ts', `export const pixi = 'NEXT';\n`);
    server.watcher.emit('change', fixture.main);
    expect(await resolve('ngx-oneforall/services/history', fixture.main)).toBe(history);
    // The tsconfig changing drops it.
    await fixture.put(
      'tsconfig.base.json',
      json({ compilerOptions: { paths: { '@klerick/ng-pixijs': ['libs/next/index.ts'] } } }),
    );
    server.watcher.emit('change', path.join(fixture.root, 'tsconfig.base.json'));
    expect(await resolve('@klerick/ng-pixijs', fixture.main)).toBe(
      path.join(fixture.root, 'libs/next/index.ts'),
    );
    expect(await resolve('ngx-oneforall/services/history', fixture.main)).toBeUndefined();
  });

  it('uses the tsconfig Analog compiles with and skips external resolutions', async () => {
    const { root, put } = await directory();
    await put('lib/feature.ts', 'export {};\n');
    for (const name of ['tsconfig.app.json', 'tsconfig.lib.json', 'tsconfig.lib.prod.json']) {
      await put(name, json({ compilerOptions: { paths: { feature: ['lib/feature.ts'] } } }));
    }
    const resolve = vi.fn(async (id: string) => ({ id }));
    const run = async (
      plugin: Plugin,
      user: Record<string, unknown>,
      resolved: { id: string; external?: boolean } | null = null,
    ) => {
      (plugin.config as (user: unknown) => void)(user);
      (plugin.configResolved as () => void)();
      if (resolved) resolve.mockResolvedValueOnce(resolved as never);
      return (plugin.resolveId as (...args: unknown[]) => Promise<unknown>).call(
        { resolve },
        'feature',
        undefined,
        {},
      );
    };
    const plugin = createTsconfigPathsPlugin(undefined);
    expect(plugin.name).toBe(NG_DOC_TSCONFIG_PATHS_PLUGIN);
    expect(await run(plugin, { root })).toEqual({ id: path.join(root, 'lib/feature.ts') });
    expect(resolve).toHaveBeenLastCalledWith(path.join(root, 'lib/feature.ts'), undefined, {
      skipSelf: true,
    });
    expect(await run(plugin, { root }, { id: 'feature', external: true })).toBeNull();
    // Without a Vite root, Analog resolves against the working directory: no tsconfig there.
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(path.join(root, 'empty'));
    try {
      expect(await run(createTsconfigPathsPlugin(undefined), {})).toBeNull();
    } finally {
      cwd.mockRestore();
    }
    vi.stubEnv('NODE_ENV', 'production');
    expect(await run(createTsconfigPathsPlugin(undefined), { root, build: { lib: {} } })).toEqual({
      id: path.join(root, 'lib/feature.ts'),
    });
    // A plugin used before Vite resolved its configuration resolves nothing.
    expect(
      await (
        createTsconfigPathsPlugin(undefined).resolveId as (...args: unknown[]) => unknown
      ).call({ resolve }, 'feature', undefined, {}),
    ).toBeNull();
  });
});

describe('tsconfig path mappings', () => {
  it('resolves the tsconfig path as the Analog Angular plugin does', () => {
    const root = path.resolve('/workspace/app');
    const absolute = path.resolve('/elsewhere/tsconfig.json');
    expect(angularTsconfigPath(root, absolute, false, false)).toBe(absolute);
    expect(angularTsconfigPath(root, () => absolute, false, false)).toBe(absolute);
    expect(angularTsconfigPath(root, 'tsconfig.vite.json', true, true)).toBe(
      path.join(root, 'tsconfig.vite.json'),
    );
    expect(angularTsconfigPath(root, undefined, false, false)).toBe(
      path.join(root, 'tsconfig.app.json'),
    );
    expect(angularTsconfigPath(root, '', false, true)).toBe(path.join(root, 'tsconfig.lib.json'));
    expect(angularTsconfigPath(root, () => '', true, true)).toBe(
      path.join(root, 'tsconfig.lib.prod.json'),
    );
  });

  it('reads paths through extends, with baseUrl, and records every configuration read', async () => {
    const { root, put } = await directory();
    await put('missing-paths.json', json({ compilerOptions: { strict: true } }));
    await put('broken.json', '{ "compilerOptions": ');
    await put(
      'base/tsconfig.json',
      json({
        compilerOptions: {
          ignoreDeprecations: '6.0',
          baseUrl: '../src',
          paths: {
            exact: ['exact.ts'],
            'lib/*': ['libs/*/index.ts'],
            'lib/special/*': ['special/*.ts'],
            'two/*/stars/*': ['ignored'],
            'pre*post': ['middle/*.ts'],
          },
        },
      }),
    );
    await put('tsconfig.json', json({ extends: './base/tsconfig.json' }));

    expect(readTsconfigPaths(path.join(root, 'none.json'))).toEqual({
      file: path.join(root, 'none.json'),
      inputs: new Set([path.join(root, 'none.json')]),
    });
    expect(readTsconfigPaths(path.join(root, 'broken.json')).mappings).toBeUndefined();
    expect(readTsconfigPaths(path.join(root, 'missing-paths.json')).mappings).toBeUndefined();

    const parsed = readTsconfigPaths(path.join(root, 'tsconfig.json'));
    expect([...parsed.inputs].sort()).toEqual([
      path.join(root, 'base/tsconfig.json'),
      path.join(root, 'tsconfig.json'),
    ]);
    const mappings = parsed.mappings!;
    expect(path.resolve(mappings.base)).toBe(path.join(root, 'src'));
    expect(mappings.patterns).toHaveLength(3);
    expect(pathMappingTargets(mappings, 'exact')).toEqual([path.join(root, 'src/exact.ts')]);
    expect(pathMappingTargets(mappings, 'lib/a')).toEqual([path.join(root, 'src/libs/a/index.ts')]);
    // The longest prefix wins, as in TypeScript.
    expect(pathMappingTargets(mappings, 'lib/special/b')).toEqual([
      path.join(root, 'src/special/b.ts'),
    ]);
    expect(pathMappingTargets(mappings, 'prexpost')).toEqual([path.join(root, 'src/middle/x.ts')]);
    expect(pathMappingTargets(mappings, 'other')).toEqual([]);

    // Without baseUrl, targets are relative to the tsconfig that declares the paths.
    await put('own/tsconfig.json', json({ compilerOptions: { paths: { own: ['own.ts'] } } }));
    const own = readTsconfigPaths(path.join(root, 'own/tsconfig.json')).mappings!;
    expect(pathMappingTargets(own, 'own')).toEqual([path.join(root, 'own/own.ts')]);
  });

  it('considers only bare specifiers that a paths key matches', () => {
    const mappings = {
      options: { paths: { exact: ['x'], 'lib/*': ['y/*'], 'ab*ba': ['z/*'] } },
      base: '/',
      exact: new Set(['exact']),
      patterns: [
        { prefix: 'lib/', suffix: '' },
        { prefix: 'ab', suffix: 'ba' },
      ],
    };
    expect(matchesPathMapping(mappings, 'exact')).toBe(true);
    expect(matchesPathMapping(mappings, 'lib/feature')).toBe(true);
    expect(matchesPathMapping(mappings, 'abxba')).toBe(true);
    // The prefix and the suffix must not overlap.
    expect(matchesPathMapping(mappings, 'aba')).toBe(false);
    for (const source of [
      '',
      'other',
      './exact',
      '../lib/x',
      '.',
      '/lib/x',
      '\0lib/x',
      'lib/x?raw',
      'C:\\lib\\x',
      'C:/lib/x',
      'node:lib/x',
      'virtual:lib/x',
    ]) {
      expect(matchesPathMapping(mappings, source), source).toBe(false);
    }
  });
});
