import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HmrContext, Plugin, ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildResult, OutputManifest } from '../../contracts';
import { ANGULAR_SHARED_PASS_FLAG } from '../../kernel/flags';
import { analogFileId, composeAngularPlugins } from '../angular-composition';
import { HostUpdateCoordinator } from '../host-updates';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const call = (hook: any) => (typeof hook === 'function' ? hook : hook.handler);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
/** Observes a hot update at once: a peer's diagnostic may reject it before the test awaits it. */
const outcome = (update: Promise<unknown>) =>
  update.then(
    () => undefined,
    (error: unknown) => error,
  );

type Role = OutputManifest['files'][number]['role'];

function manifest(generation: number, files: Array<[string, string, Role]>): OutputManifest {
  return {
    schemaVersion: 1,
    projectId: 'shared-pass',
    revision: `r${generation}`,
    generation,
    files: files.map(([file, bytes, role]) => ({
      path: file,
      digest: digest(bytes),
      role,
      ownerId: 'aggregate:shared-pass',
    })),
  };
}

function success(generation: number, value: OutputManifest) {
  return { status: 'success', generation, manifest: value } as unknown as Extract<
    BuildResult,
    { status: 'success' }
  >;
}

/** The outputs a page title edit rewrites: the page shell, routes, context and a data module. */
const OUTPUTS: Array<[string, Role]> = [
  ['guides/page.ts', 'angular'],
  ['routes.ts', 'routes'],
  ['context.ts', 'context'],
  ['guides/page.content.mjs', 'content'],
  ['index.ts', 'angular'],
];

async function outputs(version: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-shared-pass-'));
  roots.push(root);
  await mkdir(path.join(root, 'guides'), { recursive: true });
  const bytes = (file: string, at: string) =>
    file === 'index.ts' ? 'export {};\n' : `export const value = '${file} ${at}';\n`;
  const write = (at: string) =>
    Promise.all(OUTPUTS.map(([file]) => writeFile(path.join(root, file), bytes(file, at))));
  const manifestAt = (generation: number, at: string) =>
    manifest(
      generation,
      OUTPUTS.map(([file, role]) => [file, bytes(file, at), role]),
    );
  await write(version);
  return { root, write, manifestAt, file: (name: string) => path.join(root, name) };
}

describe('compiler companions of a generated TypeScript update', () => {
  it('lists the other in-place TypeScript outputs of its generation until they complete', async () => {
    const f = await outputs('a');
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
    coordinator.seed(f.root, f.manifestAt(1, 'a'));
    const unbound = coordinator.begin(f.file('routes.ts'), 'update', () => '', false);
    expect(coordinator.compilerCompanions(unbound)).toEqual([]);

    await f.write('b');
    coordinator.started(2, []);
    const read = (file: string) => () => readFile(file, 'utf8');
    const page = coordinator.begin(
      f.file('guides/page.ts'),
      'update',
      read(f.file('guides/page.ts')),
      false,
    );
    const routes = coordinator.begin(
      f.file('routes.ts'),
      'update',
      read(f.file('routes.ts')),
      false,
    );
    const data = coordinator.begin(
      f.file('guides/page.content.mjs'),
      'update',
      read(f.file('guides/page.content.mjs')),
      false,
    );
    const source = coordinator.begin(path.join(os.tmpdir(), 'app.ts'), 'update', () => '', false);
    // Before its generation's result the update is not bound to one.
    expect(coordinator.compilerCompanions(page)).toEqual([]);
    coordinator.result(success(2, f.manifestAt(2, 'b')));
    await Promise.all([page.ready, routes.ready, data.ready]);

    // Sorted, absolute, TypeScript only, never the update's own file or an unchanged output.
    expect(coordinator.compilerCompanions(page)).toEqual([
      f.file('context.ts'),
      f.file('routes.ts'),
    ]);
    expect(coordinator.compilerCompanions(routes)).toEqual([
      f.file('context.ts'),
      f.file('guides/page.ts'),
    ]);
    // A data module or a non-generated source has no companions.
    expect(coordinator.compilerCompanions(data)).toEqual([]);
    expect(coordinator.compilerCompanions(source)).toEqual([]);

    // A completed output is no longer a companion.
    await coordinator.acknowledge(routes, false, true);
    expect(coordinator.compilerCompanions(page)).toEqual([f.file('context.ts')]);
    coordinator.dispose();
    expect(coordinator.compilerCompanions(page)).toEqual([]);
  });
});

interface Compiled {
  file: string;
  companions: readonly string[];
  /** What the compiler read for each file of the pass. */
  read: Record<string, string>;
}

async function scenario(options: { patched?: boolean } = {}) {
  const f = await outputs('a');
  const notify = vi.fn();
  const fail = vi.fn();
  const coordinator = new HostUpdateCoordinator(notify, fail);
  coordinator.seed(f.root, f.manifestAt(1, 'a'));
  const passes: Compiled[] = [];
  const failures: Error[] = [];
  /** Per file: its update reaches compiler admission only once the gate opens. */
  const gates = new Map<string, Promise<void>>();
  // The patched compiler's contract: companions join the pass, and the pass is exposed.
  const compiler = vi.fn(async function (ctx: HmrContext & Record<string, any>) {
    // Like Analog, only TypeScript takes a compiler pass.
    if (!ctx.file.endsWith('.ts')) return;
    const companions: string[] = ctx.ngDocCompanionFiles ?? [];
    const pass = (async () => {
      const read: Record<string, string> = {};
      for (const file of [ctx.file, ...companions]) read[file] = await readFile(file, 'utf8');
      const failure = failures.shift();
      if (failure) throw failure;
      passes.push({ file: ctx.file, companions, read });
    })();
    if (companions.length > 0 && options.patched !== false) ctx.ngDocCompanionPass = pass;
    await pass;
  });
  const acknowledge = vi.fn((...args: Parameters<HostUpdateCoordinator['acknowledge']>) =>
    coordinator.acknowledge(...args),
  );
  const composition = composeAngularPlugins(
    [
      {
        name: '@analogjs/vite-plugin-angular',
        async buildStart() {},
        handleHotUpdate: compiler,
        transform() {
          return { code: 'class App {}; App.ɵcmp = {};' };
        },
      } as Plugin,
    ],
    f.file('index.ts'),
    {
      initialize: async () => {},
      start: (file, read) => {
        const ticket = coordinator.begin(file, 'update', read, false);
        const gate = gates.get(path.resolve(file));
        return gate ? { token: ticket.token, ready: ticket.ready.then(() => gate) } : ticket;
      },
      companions: (ticket) => coordinator.compilerCompanions(ticket),
      diagnosticMark: () => coordinator.diagnosticMark(),
      acknowledge,
      diagnostic: (ticket, error) => coordinator.diagnostic(ticket, error),
      committed: (ticket) => coordinator.committed(ticket),
      settle: (ticket) => coordinator.settle(ticket),
      fail,
    },
  );
  const wrapped = composition.plugins[0]!;
  const server = {
    environments: {
      client: {
        moduleGraph: { ensureEntryFromUrl: async () => ({}), invalidateModule() {} },
        transformRequest: async () => call(wrapped.transform)('', f.file('index.ts')),
      },
    },
  } as unknown as ViteDevServer;
  composition.attachServer(server);
  await call(wrapped.buildStart)();
  await composition.preflight();
  const context = (file: string): HmrContext => ({
    file,
    read: () => readFile(file, 'utf8'),
    timestamp: Date.now(),
    modules: [],
    server,
  });
  const typescript = OUTPUTS.filter(([file]) => /\.ts$/.test(file) && file !== 'index.ts').map(
    ([file]) => f.file(file),
  );
  const update = (file: string) => call(wrapped.handleHotUpdate)(context(file));
  /** The data module's own update, which the reload also waits for. */
  const data = () => update(f.file('guides/page.content.mjs'));
  /** Commits generation 2 and delivers one hot update per changed output. */
  const edit = async () => {
    await f.write('b');
    coordinator.started(2, []);
    const updates = [...typescript.map(update), data()];
    const settled = Promise.allSettled(updates);
    const result = success(2, f.manifestAt(2, 'b'));
    coordinator.result(result);
    coordinator.published(result, false);
    return settled;
  };
  return {
    ...f,
    coordinator,
    composition,
    compiler,
    passes,
    /** Compiler hook calls for TypeScript files: each one is a pass (or a failed one). */
    compilerCalls: () =>
      compiler.mock.calls.filter(([ctx]) => (ctx as HmrContext).file.endsWith('.ts')).length,
    failures,
    /** Holds the admission of `file`'s next updates until the returned function is called. */
    gate(file: string) {
      let open!: () => void;
      gates.set(
        path.resolve(file),
        new Promise<void>((resolve) => {
          open = resolve;
        }),
      );
      return open;
    },
    acknowledge,
    notify,
    fail,
    typescript,
    context,
    wrapped,
    update,
    data,
    edit,
    async dispose() {
      await composition.dispose();
      coordinator.dispose();
    },
  };
}

describe('one Angular pass for the TypeScript outputs of one generation', () => {
  it('compiles the companions in the first pass and acknowledges them without passes of their own', async () => {
    const s = await scenario();
    const results = await s.edit();
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(s.passes).toHaveLength(1);
    const [pass] = s.passes;
    expect([pass!.file, ...pass!.companions].sort()).toEqual([...s.typescript].sort());
    // The shared pass read the committed bytes of every output it compiled.
    for (const [file, bytes] of Object.entries(pass!.read)) {
      expect(bytes).toBe(await readFile(file, 'utf8'));
      expect(bytes).toContain(' b');
    }
    // One compiler acknowledgment. The two covered outputs (and the data module) never claim a
    // pass, so they cannot recover a later diagnostic.
    expect(s.acknowledge.mock.calls.filter((args) => args[2] === true)).toHaveLength(1);
    expect(s.acknowledge.mock.calls.filter((args) => args[2] !== true)).toHaveLength(3);
    expect(s.coordinator.blockerCount()).toBe(0);
    expect(s.notify).toHaveBeenCalledOnce();
    expect(s.fail).not.toHaveBeenCalled();
    await s.dispose();
  });

  it(`compiles every output on its own with ${ANGULAR_SHARED_PASS_FLAG}=0`, async () => {
    vi.stubEnv(ANGULAR_SHARED_PASS_FLAG, '0');
    const s = await scenario();
    await s.edit();
    expect(s.passes.map((pass) => pass.file).sort()).toEqual([...s.typescript].sort());
    expect(s.passes.every((pass) => pass.companions.length === 0)).toBe(true);
    expect(s.coordinator.blockerCount()).toBe(0);
    expect(s.notify).toHaveBeenCalledOnce();
    await s.dispose();
  });

  it('never trusts companions that a compiler did not confirm with its pass', async () => {
    const s = await scenario({ patched: false });
    await s.edit();
    // Offered to the first pass, then compiled again by their own passes.
    expect(s.compilerCalls()).toBe(3);
    expect(s.passes.map((pass) => pass.file).sort()).toEqual([...s.typescript].sort());
    expect(s.coordinator.blockerCount()).toBe(0);
    await s.dispose();
  });

  it('compiles a companion again when its bytes changed after the shared pass read them', async () => {
    const s = await scenario();
    const late = s.typescript[1]!;
    await s.write('b');
    s.coordinator.started(2, []);
    const [main, ...others] = s.typescript;
    const mainUpdate = s.update(main!);
    const result = success(2, s.manifestAt(2, 'b'));
    s.coordinator.result(result);
    s.coordinator.published(result, false);
    await vi.waitFor(() => expect(s.passes).toHaveLength(1));
    // A rewrite after the pass: the same bytes, but a new physical version.
    await writeFile(late, await readFile(late, 'utf8'));
    const updates = [mainUpdate, s.data(), ...others.map(s.update)];
    await vi.waitFor(() => expect(s.passes.map((pass) => pass.file)).toEqual([main, late]));
    // The rewrite is not this generation's output, so its update stays unsettled (a real
    // watcher would start the next generation); disposal releases it.
    await s.dispose();
    await Promise.allSettled(updates);
    expect(s.compilerCalls()).toBe(2);
  });

  it('compiles every companion on its own after the shared pass fails with a diagnostic', async () => {
    const s = await scenario();
    const failure = Object.assign(new Error('companion type error'), {
      code: 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC',
    });
    s.failures.push(failure);
    await s.write('b');
    s.coordinator.started(2, []);
    const [main, ...others] = s.typescript;
    const failed = s.update(main!).then(
      () => undefined,
      (error: unknown) => error,
    );
    const result = success(2, s.manifestAt(2, 'b'));
    s.coordinator.result(result);
    s.coordinator.published(result, false);
    expect(await failed).toBe(failure);
    const repaired = await Promise.allSettled([...others.map(s.update), s.data()]);
    // The failure left no coverage: the next update takes a real pass (with the outputs not yet
    // completed, the failed one included) and repairs the diagnostic.
    expect(s.compilerCalls()).toBe(3 - 1);
    expect(s.passes).toHaveLength(1);
    const [repair] = s.passes;
    expect(others).toContain(repair!.file);
    expect([repair!.file, ...repair!.companions].sort()).toEqual([...s.typescript].sort());
    // A peer update that settles while the diagnostic still stands rejects with it, as without
    // shared passes; the repair clears it and the reload follows.
    for (const item of repaired) if (item.status === 'rejected') expect(item.reason).toBe(failure);
    expect(s.coordinator.diagnosticError()).toBeUndefined();
    expect(s.coordinator.blockerCount()).toBe(0);
    expect(s.notify).toHaveBeenCalledOnce();
    await s.dispose();
  });
  it('repairs a diagnostic of a later-numbered update that failed before the covering pass', async () => {
    // Updates numbered page (1), context (2), routes (3); routes is admitted first and its pass
    // fails while context is broken, context's own pass then succeeds, and page comes last.
    const s = await scenario();
    const [page, routes, context] = s.typescript as [string, string, string];
    const open = new Map([page, context, routes].map((file) => [file, s.gate(file)] as const));
    const failure = Object.assign(new Error('context is broken'), {
      code: 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC',
    });
    s.failures.push(failure);
    await s.write('b');
    s.coordinator.started(2, []);
    const updates = new Map(
      [page, context, routes].map((file) => [file, outcome(s.update(file))] as const),
    );
    const data = outcome(s.data());
    const result = success(2, s.manifestAt(2, 'b'));
    s.coordinator.result(result);
    s.coordinator.published(result, false);

    open.get(routes)!();
    expect(await updates.get(routes)).toBe(failure);
    expect(s.coordinator.diagnosticError()).toBe(failure);

    open.get(context)!();
    await vi.waitFor(() => expect(s.passes.map((pass) => pass.file)).toEqual([context]));
    // The successful pass started after routes' diagnostic: it repairs it, although routes'
    // update is numbered after context's.
    await vi.waitFor(() => expect(s.coordinator.diagnosticError()).toBeUndefined());

    open.get(page)!();
    await Promise.all([updates.get(context), updates.get(page), data]);
    // Page was covered by context's pass and took none of its own.
    expect(s.compilerCalls()).toBe(2);
    expect(s.coordinator.blockerCount()).toBe(0);
    expect(s.notify).toHaveBeenCalledOnce();
    await s.dispose();
  });

  it('takes a real pass for a covered update after a later pass failed', async () => {
    const s = await scenario();
    const [page, routes, context] = s.typescript as [string, string, string];
    const open = new Map([page, routes].map((file) => [file, s.gate(file)] as const));
    await s.write('b');
    s.coordinator.started(2, []);
    const updates = [page, routes, context].map((file) => outcome(s.update(file)));
    const data = outcome(s.data());
    const result = success(2, s.manifestAt(2, 'b'));
    s.coordinator.result(result);
    s.coordinator.published(result, false);
    // Context's pass covers page and routes.
    await vi.waitFor(() => expect(s.passes.map((pass) => pass.file)).toEqual([context]));
    expect([...s.passes[0]!.companions].sort()).toEqual([page, routes].sort());

    // Then an application source fails to compile.
    const application = path.join(s.root, 'application.ts');
    await writeFile(application, 'export const broken: number = "text";\n');
    const failure = Object.assign(new Error('application type error'), {
      code: 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC',
    });
    s.failures.push(failure);
    expect(await outcome(s.update(application))).toBe(failure);

    // The failed pass dropped every coverage, so page compiles (a skip would repair nothing),
    // and its pass (routes joins it) repairs the diagnostic recorded before it started.
    open.get(page)!();
    await vi.waitFor(() => expect(s.passes.map((pass) => pass.file)).toEqual([context, page]));
    expect(s.passes[1]!.companions).toEqual([routes]);
    open.get(routes)!();
    await Promise.all([...updates, data]);
    // Context, the application source and page: routes was then covered by page's pass.
    expect(s.compilerCalls()).toBe(3);
    expect(s.coordinator.diagnosticError()).toBeUndefined();
    expect(s.coordinator.blockerCount()).toBe(0);
    expect(s.notify).toHaveBeenCalledOnce();
    await s.dispose();
  });

  // Under load a watcher may report one write twice, the second time after the generation
  // settled. Each report of bytes the shared pass compiled is part of that generation: it takes no
  // pass, and Vite adds no reload of its own (the adapter announces it).
  it('takes no pass and no reload of its own for a repeated report of bytes the shared pass compiled', async () => {
    const s = await scenario();
    await s.edit();
    expect(s.passes).toHaveLength(1);
    const [pass] = s.passes;
    expect(s.notify).toHaveBeenCalledOnce();
    for (const file of [pass!.file, ...pass!.companions]) {
      const context = s.context(file);
      await call(s.wrapped.handleHotUpdate)(context);
      expect(s.coordinator.announces(context.read)).toBe(true);
    }
    expect(s.passes).toHaveLength(1);
    expect(s.compilerCalls()).toBe(1);
    expect(s.coordinator.blockerCount()).toBe(0);
    expect(s.notify).toHaveBeenCalledOnce();
    // Bytes no pass compiled are compiled, and are no report of that generation.
    const late = pass!.companions[0]!;
    await writeFile(late, await readFile(late, 'utf8'));
    const rewritten = s.context(late);
    const pending = outcome(call(s.wrapped.handleHotUpdate)(rewritten));
    await vi.waitFor(() => expect(s.passes).toHaveLength(2));
    expect(s.coordinator.announces(rewritten.read)).toBe(false);
    await s.dispose();
    await pending;
  });

  // Under load FSEvents may deliver a created file's creation and its write apart, so the
  // watcher reports a created output as changed, after its creation or (for a path it still knew)
  // instead of it. It is that generation's output: it takes the generation's one pass, and the
  // generation settles without waiting for a creation report that never comes.
  it.each([
    ['after its creation', true],
    ['instead of its creation', false],
  ])(
    'takes one pass for a generation whose created output is reported as changed %s',
    async (_label, created) => {
      const s = await scenario();
      await s.write('b');
      const file = s.file('guides/created.ts');
      const bytes = "export const value = 'created';\n";
      await writeFile(file, bytes);
      const next = s.manifestAt(2, 'b');
      next.files.push({
        path: 'guides/created.ts',
        digest: digest(bytes),
        role: 'angular',
        ownerId: 'aggregate:shared-pass',
      });
      s.coordinator.started(2, []);
      const creation = created
        ? s.coordinator.begin(file, 'create', () => readFile(file, 'utf8'), false)
        : undefined;
      const context = s.context(file);
      const updates = [file, ...s.typescript].map((item) =>
        outcome(call(s.wrapped.handleHotUpdate)(item === file ? context : s.context(item))),
      );
      const data = outcome(s.data());
      const result = success(2, next);
      s.coordinator.result(result);
      s.coordinator.published(result, false);
      if (creation) await s.coordinator.complete(creation);
      expect(await Promise.all([...updates, data])).toEqual(
        updates.map(() => undefined).concat([undefined]),
      );
      expect(s.passes).toHaveLength(1);
      const [pass] = s.passes;
      expect([pass!.file, ...pass!.companions].sort()).toEqual([file, ...s.typescript].sort());
      expect(s.coordinator.announces(context.read)).toBe(true);
      expect(s.coordinator.blockerCount()).toBe(0);
      expect(s.notify).toHaveBeenCalledOnce();
      expect(s.fail).not.toHaveBeenCalled();
      await s.dispose();
    },
  );

  it('passes companions to Analog with forward slashes, as Analog keys its files', async () => {
    expect(analogFileId('C:\\docs\\generated\\routes.ts')).toBe('C:/docs/generated/routes.ts');
    expect(analogFileId('/docs/generated/./guides/../routes.ts')).toBe('/docs/generated/routes.ts');
    const s = await scenario();
    await s.edit();
    const companions = s.passes.flatMap((pass) => pass.companions);
    expect(companions.length).toBeGreaterThan(0);
    for (const companion of companions) {
      expect(companion).not.toContain('\\');
      expect(companion).toBe(analogFileId(companion));
    }
    await s.dispose();
  });
});
