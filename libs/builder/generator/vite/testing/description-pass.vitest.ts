import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type HmrContext,
  type HotUpdateOptions,
  type Plugin,
  type ViteDevServer,
  createServer,
} from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNgDocVitePlugin } from '..';
import {
  type Fixture,
  angularPackages,
  generatorDist,
  generatorOptions,
  packageAliases,
  project,
  removeFixtures,
  save,
} from './native-fixture';

const servers: ViteDevServer[] = [];
afterEach(async () => {
  try {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  } finally {
    await removeFixtures();
    vi.unstubAllEnvs();
  }
}, 30_000);

/** The fixture's description module, relative to its root. */
const DESCRIPTION = 'docs/ng-doc.page.ts';

describe('the description pass', () => {
  it('compiles an edited description module in the pass of its generation, serving what its own pass serves', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    // One fixture for both arms, so generated identities and paths are the same.
    const fixture = await project();
    const joined = await titleEdit(fixture, true);
    const own = await titleEdit(fixture, false);
    // The edit rewrites several generated TypeScript modules (page, routes, context).
    expect(joined.changed.length).toBeGreaterThanOrEqual(3);
    expect(own.changed).toEqual(joined.changed);
    // On: one pass for the edit, which took the description module as a companion; the module's
    // own update took none.
    expect(joined.passes).toEqual([
      { file: expect.any(String), companions: joined.changed.length, confirmed: true },
    ]);
    expect(joined.passes[0]!.file).not.toBe(DESCRIPTION);
    // Off: the description module's own pass first, then the generation's shared pass.
    expect(own.passes).toEqual([
      { file: DESCRIPTION, companions: 0, confirmed: false },
      { file: expect.any(String), companions: own.changed.length - 1, confirmed: true },
    ]);
    // The same modules are served, the description module included.
    expect(joined.served.get(DESCRIPTION)).toContain('Retitled guide');
    expect(joined.served.get('routes.ts')).toContain('Retitled guide');
    expect(joined.served).toEqual(own.served);
  }, 180_000);
});

/**
 * Starts the patched host, retitles the page, waits for the adapter's reload and returns the
 * generated TypeScript modules the edit rewrote, the Analog passes it ran (of generated modules
 * and of the description module) and the code Vite then serves for each of them and for the
 * description module. Restores the title before closing the server.
 * @param fixture The workspace.
 * @param descriptionPass Whether `NGDOC_ANGULAR_DESCRIPTION_PASS` is on.
 */
async function titleEdit(fixture: Fixture, descriptionPass: boolean) {
  vi.stubEnv('NGDOC_ANGULAR_DESCRIPTION_PASS', descriptionPass ? undefined : '0');
  const { createNgDocAngularPlugins } = await import(
    pathToFileURL(path.join(generatorDist, 'vite/angular/index.js')).href
  );
  const angularPlugins: Plugin[] = createNgDocAngularPlugins({
    tsconfig: fixture.tsconfig,
    workspaceRoot: fixture.root,
  });
  const compiler = angularPlugins.find(
    (candidate) => candidate.name === '@analogjs/vite-plugin-angular',
  )!;
  const originalHot = compiler.handleHotUpdate as (context: unknown) => unknown;
  const description = path.join(fixture.root, DESCRIPTION);
  let editing = false;
  const passes: Array<{ file: string; companions: number; confirmed: boolean }> = [];
  compiler.handleHotUpdate = async function (
    context: HmrContext & { ngDocCompanionFiles?: string[]; ngDocCompanionPass?: unknown },
  ) {
    const result = await originalHot.call(this, context);
    const generated = context.file.startsWith(fixture.output) && /\.ts$/.test(context.file);
    if (editing && (generated || context.file === description)) {
      passes.push({
        file: generated ? path.relative(fixture.output, context.file) : DESCRIPTION,
        companions: context.ngDocCompanionFiles?.length ?? 0,
        confirmed: context.ngDocCompanionPass !== undefined,
      });
    }
    return result;
  } as Plugin['handleHotUpdate'];
  const changed = new Set<string>();
  let reloads = 0;
  const server = await createServer({
    root: fixture.root,
    // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
    // default one is shared by every fixture.
    cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
    configFile: false,
    logLevel: 'silent',
    plugins: [
      createNgDocVitePlugin({
        analogLiveReload: true,
        angularPlugins,
        angularComponentProbe: fixture.app,
        generator: {
          ...generatorOptions(fixture, fixture.output, fixture.cache),
          session: { batchDelayMs: 5 },
        },
      }),
      {
        name: 'title-edit-observer',
        configureServer(value: ViteDevServer) {
          const send = value.ws.send.bind(value.ws) as (...args: unknown[]) => void;
          value.ws.send = ((...args: unknown[]) => {
            if ((args[0] as { type?: string } | undefined)?.type === 'full-reload') reloads++;
            send(...args);
          }) as typeof value.ws.send;
        },
        hotUpdate: {
          order: 'pre',
          handler(context: HotUpdateOptions) {
            if (
              editing &&
              this.environment.name === 'client' &&
              context.type === 'update' &&
              context.file.startsWith(fixture.output) &&
              /\.ts$/.test(context.file)
            ) {
              changed.add(path.relative(fixture.output, context.file));
            }
          },
        },
      },
    ],
    resolve: { alias: packageAliases(), dedupe: angularPackages() },
    server: { host: '127.0.0.1', port: 0 },
  });
  servers.push(server);
  await server.listen();
  const client = server.environments.client;
  // Every generated module is in the module graph before the edit, as in a loaded page.
  const manifest = JSON.parse(
    await readFile(path.join(fixture.output, '.ng-doc-output-manifest.json'), 'utf8'),
  );
  const url = (file: string) => `/@fs${file}`;
  for (const file of (manifest.files as Array<{ path: string }>).map((entry) => entry.path)) {
    if (/\.ts$/.test(file)) await client.transformRequest(url(path.join(fixture.output, file)));
  }
  const before = await readFile(description, 'utf8');
  editing = true;
  const edited = reloads;
  await save(fixture, description, before.replace("title: 'Guide'", "title: 'Retitled guide'"));
  await vi.waitFor(() => expect(reloads).toBeGreaterThan(edited), {
    timeout: 90_000,
    interval: 25,
  });
  const counted = [...passes];
  // Each server has its own update timestamps and dependency optimization.
  const normalize = (code: string) =>
    code.replace(/([?&])t=\d+/g, '$1t=<t>').replace(/([?&])v=[0-9a-f]+/g, '$1v=<v>');
  const served = new Map<string, string>();
  const serve = async (key: string, file: string) => {
    for (const node of client.moduleGraph.getModulesByFile(file) ?? [])
      client.moduleGraph.invalidateModule(node);
    served.set(key, normalize((await client.transformRequest(url(file)))?.code ?? ''));
  };
  for (const file of [...changed].sort()) await serve(file, path.join(fixture.output, file));
  // The edited description module, as the reloaded page requests it.
  await serve(DESCRIPTION, description);
  editing = false;
  // Restored while this server runs, so the next one starts on an unchanged output.
  const restored = reloads;
  await save(fixture, description, before);
  await vi.waitFor(() => expect(reloads).toBeGreaterThan(restored), {
    timeout: 90_000,
    interval: 25,
  });
  await server.close();
  servers.splice(servers.indexOf(server), 1);
  return { changed: [...changed].sort(), passes: counted, served };
}
