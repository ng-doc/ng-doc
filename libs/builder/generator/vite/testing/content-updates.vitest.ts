import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Plugin, type ViteDevServer, type WebSocketClient, createServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGeneratorBuildSession } from '../../bootstrap';
import { createNgDocVitePlugin } from '..';
import {
  CONTENT_CLIENT_EVENT,
  CONTENT_UPDATE_CLIENT,
  CONTENT_UPDATE_EVENT,
  contentOnly,
  contentUpdateClientTags,
  sendContentUpdate,
} from '../content-updates';
import { type AnnouncedChange, HostUpdateCoordinator } from '../host-updates';
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
const sockets: WebSocket[] = [];
afterEach(async () => {
  try {
    for (const socket of sockets.splice(0)) socket.close();
    await Promise.all(servers.splice(0).map((server) => server.close()));
  } finally {
    await removeFixtures();
    vi.unstubAllEnvs();
  }
}, 30_000);

type Role = NonNullable<AnnouncedChange['after']>['role'];

/** A file whose bytes changed, in the role it keeps. */
const updated = (file: string, role: Role): AnnouncedChange => ({
  path: file,
  file: `/out/${file}`,
  before: { digest: 'old', role },
  after: { digest: 'new', role },
});

describe('content-only publications', () => {
  it('takes changed content modules, the search index and the keyword map as content', () => {
    expect(
      contentOnly(
        [
          updated('assets/ng-doc/indexes.json', 'search'),
          updated('assets/ng-doc/keywords.json', 'asset'),
          updated('guides/a/index/page.content.mjs', 'content'),
          updated('guides/b/page.content.mjs', 'content'),
        ],
        'assets/ng-doc',
      ),
    ).toEqual({
      modules: ['/out/guides/a/index/page.content.mjs', '/out/guides/b/page.content.mjs'],
      search: true,
    });
    expect(
      contentOnly([updated('guides/a/page.content.mjs', 'content')], 'assets\\ng-doc'),
    ).toEqual({ modules: ['/out/guides/a/page.content.mjs'], search: false });
    // The asset directory may be the output root itself.
    expect(contentOnly([updated('keywords.json', 'asset')], '')).toEqual({
      modules: [],
      search: false,
    });
  });

  it('reloads for anything else', () => {
    const content = updated('guides/a/page.content.mjs', 'content');
    const { before, after, ...created } = content;
    for (const changes of [
      undefined,
      [],
      // Created and deleted content, TypeScript, another asset, a role change.
      [{ ...created, after: after! }],
      [{ ...created, before: before! }],
      [updated('guides/a/page.ts', 'angular')],
      [updated('guides/a/page.source.mjs', 'content')],
      [updated('assets/ng-doc/api-list.json', 'api-list')],
      [updated('assets/ng-doc/image.png', 'asset')],
      [{ ...content, after: { digest: 'new', role: 'asset' as const } }],
    ]) {
      expect(contentOnly(changes, 'assets/ng-doc')).toBeUndefined();
    }
  });

  it('adds the client to development pages, once, and not with the switch off', () => {
    const [tag, ...rest] = contentUpdateClientTags('<html><head></head></html>');
    expect(rest).toEqual([]);
    expect(tag).toMatchObject({ tag: 'script', attrs: { type: 'module' }, injectTo: 'head' });
    expect(tag!.children).toBe(CONTENT_UPDATE_CLIENT);
    expect(contentUpdateClientTags('<script data-ng-doc-content-updates></script>')).toEqual([]);
    vi.stubEnv('NGDOC_VITE_CONTENT_UPDATE', '0');
    expect(contentUpdateClientTags('<html></html>')).toEqual([]);
  });
});

describe('the content update sender', () => {
  function fakeServer(clients: WebSocketClient[], base: string = '/') {
    const broadcast: unknown[] = [];
    const modules = new Map<string, Array<{ url: string }>>([
      ['/out/a.content.mjs', [{ url: '/@fs/out/a.content.mjs' }]],
      ['/out/b.content.mjs', [{ url: '/b.content.mjs?x=1' }, { url: '/@fs/out/a.content.mjs' }]],
    ]);
    return {
      broadcast,
      server: {
        config: { base },
        ws: { clients: new Set(clients), send: (payload: unknown) => broadcast.push(payload) },
        environments: {
          client: { moduleGraph: { getModulesByFile: (file: string) => modules.get(file) } },
        },
      } as unknown as ViteDevServer,
    };
  }

  function client() {
    const sent: unknown[][] = [];
    return {
      sent,
      client: { send: (...args: unknown[]) => sent.push(args) } as unknown as WebSocketClient,
    };
  }

  it('sends the loaded modules to announced clients and a reload to the others', () => {
    const announced = client();
    const other = client();
    const { server, broadcast } = fakeServer([announced.client, other.client], '/docs');
    sendContentUpdate(
      server,
      new WeakSet([announced.client]),
      {
        modules: ['/out/a.content.mjs', '/out/b.content.mjs', '/out/never.content.mjs'],
        search: true,
      },
      42,
    );
    expect(announced.sent).toEqual([
      [
        CONTENT_UPDATE_EVENT,
        {
          version: 1,
          modules: ['/docs/@fs/out/a.content.mjs?t=42', '/docs/b.content.mjs?x=1&t=42'],
          search: true,
        },
      ],
    ]);
    expect(other.sent).toEqual([[{ type: 'full-reload' }]]);
    expect(broadcast).toEqual([]);
  });

  it('broadcasts a reload, which Vite keeps for the next page, when no client is connected', () => {
    const { server, broadcast } = fakeServer([]);
    sendContentUpdate(server, new WeakSet(), { modules: [], search: false }, 1);
    expect(broadcast).toEqual([{ type: 'full-reload' }]);
  });
});

describe('the development client', () => {
  /**
   * Runs the client with stand-ins for its hot context, `import()`, the window and the location.
   * @param modules The payload of each module URL; a missing one fails its import.
   */
  function runClient(modules: Record<string, unknown>) {
    const handlers = new Map<string, (data: unknown) => void>();
    const sent: unknown[][] = [];
    const hot = {
      on: (event: string, handler: (data: unknown) => void) => handlers.set(event, handler),
      send: (...args: unknown[]) => sent.push(args),
    };
    const window = new EventTarget();
    const location = { reload: vi.fn() };
    const console = { error: vi.fn() };
    const imports: string[] = [];
    const load = async (url: string) => {
      imports.push(url);
      await new Promise((resolve) => setTimeout(resolve, url.includes('slow') ? 20 : 0));
      if (!(url in modules)) throw new Error(`Cannot load ${url}`);
      return { default: modules[url] };
    };
    const source = CONTENT_UPDATE_CLIENT.replace('import.meta.hot', '__hot').replace(
      'import(/* @vite-ignore */ url)',
      '__import(url)',
    );
    new Function('__hot', '__import', 'window', 'location', 'console', source)(
      hot,
      load,
      window,
      location,
      console,
    );
    return { handlers, sent, window, location, console, imports };
  }

  it('announces itself and hands the imported payloads to the page, in arrival order', async () => {
    const client = runClient({ '/slow.mjs': { id: 'slow' }, '/a.mjs': { id: 'a' } });
    expect(client.sent).toEqual([[CONTENT_CLIENT_EVENT, { version: 1 }]]);
    const applied: unknown[] = [];
    client.window.addEventListener(CONTENT_UPDATE_EVENT, (event) => {
      applied.push((event as CustomEvent).detail);
      event.preventDefault();
    });
    const update = client.handlers.get(CONTENT_UPDATE_EVENT)!;
    update({ modules: ['/slow.mjs'], search: true });
    update({ modules: ['/a.mjs'], search: false });
    await vi.waitFor(() => expect(applied).toHaveLength(2));
    expect(applied).toEqual([
      { payloads: [{ id: 'slow' }], search: true },
      { payloads: [{ id: 'a' }], search: false },
    ]);
    expect(client.location.reload).not.toHaveBeenCalled();
  });

  it('reloads when the page does not apply the update or an import fails', async () => {
    const unapplied = runClient({ '/a.mjs': { id: 'a' } });
    unapplied.handlers.get(CONTENT_UPDATE_EVENT)!({ modules: ['/a.mjs'], search: false });
    await vi.waitFor(() => expect(unapplied.location.reload).toHaveBeenCalledTimes(1));

    const failing = runClient({});
    failing.window.addEventListener(CONTENT_UPDATE_EVENT, (event) => event.preventDefault());
    failing.handlers.get(CONTENT_UPDATE_EVENT)!({ modules: ['/missing.mjs'], search: false });
    await vi.waitFor(() => expect(failing.location.reload).toHaveBeenCalledTimes(1));
    expect(failing.console.error).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a hot context', () => {
    expect(() =>
      new Function('__hot', CONTENT_UPDATE_CLIENT.replace('import.meta.hot', '__hot'))(undefined),
    ).not.toThrow();
  });
});

describe('the announcement of a settled publication', () => {
  const manifest = (generation: number, files: Array<[string, string, string]>) => ({
    schemaVersion: 1,
    generation,
    files: files.map(([file, digest, role]) => ({ path: file, digest, role, ownerId: 'o' })),
  });

  it('lists the changed files, unless a compiled source or a recovery asks for a reload', () => {
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const root = path.resolve('/out');
    // A data file, so no hot update of it obliges anything and each publication announces at once.
    coordinator.seed(root, manifest(0, [['indexes.json', '1', 'search']]) as never);
    const publish = (generation: number, digest: string, changes: string[], recovered = false) => {
      coordinator.started(
        generation,
        changes.map((file) => ({ kind: 'update', path: file })) as never,
      );
      const result = {
        status: 'success',
        generation,
        manifest: manifest(generation, [['indexes.json', digest, 'search']]),
      } as never;
      coordinator.result(result);
      coordinator.published(result, recovered);
    };
    publish(1, '2', ['/docs/a.md']);
    expect(notify).toHaveBeenLastCalledWith([
      {
        path: 'indexes.json',
        file: path.join(root, 'indexes.json'),
        before: { digest: '1', role: 'search' },
        after: { digest: '2', role: 'search' },
      },
    ]);
    publish(2, '3', ['/docs/ng-doc.page.ts']);
    expect(notify).toHaveBeenLastCalledWith(undefined);
    publish(3, '4', ['/docs/a.md'], true);
    expect(notify).toHaveBeenLastCalledWith(undefined);
    publish(4, '5', ['/docs/a.md']);
    expect(notify).toHaveBeenLastCalledWith([expect.objectContaining({ path: 'indexes.json' })]);
    expect(notify).toHaveBeenCalledTimes(4);
    coordinator.dispose();
  });
});

describe('content updates in the real development host', () => {
  it('updates a page in place for a text edit and reloads it for anything else', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    const fixture = await project();
    const host = await startHost(fixture);
    const announced = await host.socket(true);
    const plain = await host.socket(false);
    // The page carries the client, which Vite serves as a module with a hot context.
    const index = await host.fetch('/');
    const proxy = /<script type="module" src="([^"]*html-proxy[^"]*)"/.exec(index)?.[1];
    expect(proxy).toBeDefined();
    const client = await host.fetch(proxy!);
    expect(client).toContain('createHotContext');
    expect(client).toContain(CONTENT_UPDATE_EVENT);

    // A text edit: the announced page gets the changed content module, the other one a reload.
    const before = announced.messages.length;
    await save(fixture, fixture.markdown, '# Guide\nEdited body with new searchable words.\n');
    const update = await announced.next(before, CONTENT_UPDATE_EVENT);
    expect(announced.messages.slice(before).some(isReload)).toBe(false);
    await vi.waitFor(() => expect(plain.messages.some(isReload)).toBe(true), { timeout: 60_000 });
    expect(update.search).toBe(true);
    expect(update.modules).toHaveLength(1);
    const [module] = update.modules;
    expect(module).toMatch(/^\/@fs\/.*\/page\.content\.mjs\?t=\d+$/);
    // What the page imports is the committed module, which a cold build of the tree commits too.
    const served = await host.fetch(module!);
    const payload = JSON.parse(/export default (\{.*\});/.exec(served)![1]!);
    const committed = path.join('/', module!.replace(/^\/@fs\//, '').replace(/\?.*$/, ''));
    expect(`export default ${JSON.stringify(payload)};\n`).toBe(await readFile(committed, 'utf8'));
    expect(payload.html).toContain('Edited body with new searchable words.');
    const cold = await coldBuild(fixture);
    expect(await tree(fixture.output)).toEqual(await tree(cold));

    // A title edit rewrites TypeScript modules: every page reloads.
    const titled = announced.messages.length;
    await save(
      fixture,
      path.join(fixture.docs, 'ng-doc.page.ts'),
      "const Guide = { title: 'Retitled', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n",
    );
    await announced.next(titled, 'full-reload');
    expect(
      announced.messages.slice(titled).some((message) => message.event === CONTENT_UPDATE_EVENT),
    ).toBe(false);
    expect(host.errors()).toEqual([]);
  }, 180_000);

  it('reloads every page for a text edit with the switch off', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('NGDOC_VITE_CONTENT_UPDATE', '0');
    const fixture = await project();
    const host = await startHost(fixture);
    const announced = await host.socket(true);
    expect(await host.fetch('/')).not.toContain('html-proxy');
    const before = announced.messages.length;
    await save(fixture, fixture.markdown, '# Guide\nEdited with the switch off.\n');
    await announced.next(before, 'full-reload');
    expect(announced.messages.some((message) => message.event === CONTENT_UPDATE_EVENT)).toBe(
      false,
    );
    expect(host.errors()).toEqual([]);
  }, 180_000);
});

interface Message {
  type: string;
  event?: string;
  data?: { modules: string[]; search: boolean };
}

const isReload = (message: Message): boolean => message.type === 'full-reload';

async function startHost(fixture: Fixture) {
  const { createNgDocAngularPlugins } = await import(
    pathToFileURL(path.join(generatorDist, 'vite/angular/index.js')).href
  );
  const angularPlugins: Plugin[] = createNgDocAngularPlugins({
    tsconfig: fixture.tsconfig,
    workspaceRoot: fixture.root,
  });
  const errors: string[] = [];
  const server = await createServer({
    root: fixture.root,
    // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
    // default one is shared by every fixture.
    cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
    configFile: false,
    logLevel: 'silent',
    customLogger: {
      info: () => undefined,
      warn: () => undefined,
      warnOnce: () => undefined,
      error: (message: string) => void errors.push(message),
      clearScreen: () => undefined,
      hasErrorLogged: () => false,
      hasWarned: false,
    },
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
    ],
    resolve: { alias: packageAliases(), dedupe: angularPackages() },
    server: { host: '127.0.0.1', port: 0 },
  });
  servers.push(server);
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Missing Vite address');
  const origin = `http://127.0.0.1:${address.port}`;
  // Every generated module is in the module graph, as in a loaded page.
  const manifest = JSON.parse(
    await readFile(path.join(fixture.output, '.ng-doc-output-manifest.json'), 'utf8'),
  );
  for (const file of (manifest.files as Array<{ path: string }>).map((entry) => entry.path)) {
    if (/\.(?:ts|mjs)$/.test(file))
      await server.environments.client.transformRequest(`/@fs${path.join(fixture.output, file)}`);
  }
  let announcements = 0;
  server.ws.on(CONTENT_CLIENT_EVENT, () => announcements++);
  return {
    errors: () => [...errors],
    async fetch(url: string) {
      const response = await fetch(`${origin}${url}`, { headers: { accept: 'text/html,*/*' } });
      expect(response.status, url).toBe(200);
      return response.text();
    },
    /**
     * A browser's HMR connection.
     * @param announce Whether it announces the NgDoc client, as the client script does.
     */
    async socket(announce: boolean) {
      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/?token=${server.config.webSocketToken}`,
        'vite-hmr',
      );
      sockets.push(socket);
      const messages: Message[] = [];
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as Message;
        if (message.type !== 'connected' && message.type !== 'ping') messages.push(message);
      });
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('HMR socket failed')), {
          once: true,
        });
      });
      if (announce) {
        const expected = announcements + 1;
        socket.send(
          JSON.stringify({ type: 'custom', event: CONTENT_CLIENT_EVENT, data: { version: 1 } }),
        );
        // The host's listener was registered first, so it has recorded the client too.
        await vi.waitFor(() => expect(announcements).toBe(expected));
      }
      return {
        messages,
        /** The first message of a kind (a type or a custom event) after `index`. */
        async next(index: number, kind: string) {
          let found: Message | undefined;
          await vi.waitFor(
            () => {
              found = messages
                .slice(index)
                .find((message) => message.type === kind || message.event === kind);
              expect(found, kind).toBeDefined();
            },
            { timeout: 90_000, interval: 25 },
          );
          return found!.data!;
        },
      };
    },
  };
}

let colds = 0;

/** A cold build of the fixture's sources beside the host's output (same relative paths). */
async function coldBuild(fixture: Fixture): Promise<string> {
  const output = path.join(fixture.root, `cold-${++colds}`);
  const session = createGeneratorBuildSession(
    generatorOptions(fixture, output, path.join(fixture.root, `.cold-cache-${colds}`)),
  );
  try {
    expect((await session.buildOnce({ mode: 'development' })).status).toBe('success');
  } finally {
    await session.dispose();
  }
  return output;
}

/** Every published file's bytes, by path, without the manifest. */
async function tree(root: string, prefix: string = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.name === '.ng-doc-output-manifest.json') continue;
    if (entry.isDirectory()) Object.assign(files, await tree(root, relative));
    else files[relative] = await readFile(path.join(root, relative), 'utf8');
  }
  return files;
}
