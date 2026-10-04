import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildResult, OutputManifest } from '../../contracts';
import { ANGULAR_STRUCTURAL_PASS_FLAG } from '../../kernel/flags';
import {
  type AngularCompositionBridge,
  analogHostHooks,
  composeAngularPlugins,
} from '../angular-composition';
import { HostUpdateCoordinator } from '../host-updates';
import type { OutputLease } from '../lease';
import { ViteAdapterLifecycle } from '../lifecycle';
import type { ViteFileEventSource } from '../vite-event-source';

/**
 * The structural pass: the patched Analog compiler leaves the add and unlink events of generated
 * modules to the pass of their generation (`api.ngDocHost.claimFilesystemChange`). The native
 * differential (one pass on, two off, the same served modules) is in `startup-native.vitest.ts`.
 */

const temporary: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A component probe file (never compiled here). */
async function probe(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-structural-pass-'));
  temporary.push(root);
  const file = path.join(root, 'probe.component.ts');
  await writeFile(file, 'export class ProbeComponent {}\n');
  return file;
}

/**
 * An Analog compiler plugin double.
 * @param hooks Its `api.ngDocHost`, if any.
 */
function compiler(hooks?: unknown): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular',
    buildStart() {},
    handleHotUpdate() {},
    transform() {
      return undefined;
    },
    ...(hooks === undefined ? {} : { api: { ngDocHost: hooks } }),
  };
}

/**
 * A composition bridge double.
 * @param claims Its `claimsFilesystemChange`, if any.
 */
function bridge(claims?: (file: string) => boolean): AngularCompositionBridge {
  return {
    initialize: async () => {},
    start: () => ({ ready: Promise.resolve(), token: {} }),
    acknowledge: async () => {},
    diagnostic: () => {},
    committed: async () => {},
    settle: async () => {},
    fail: () => {},
    ...(claims ? { claimsFilesystemChange: claims } : {}),
  };
}

describe('the compiler hooks of the patched Analog compiler', () => {
  it('are read only from a compiler that exposes them', () => {
    const hooks = { passes: 0 };
    expect(analogHostHooks(compiler(hooks))).toBe(hooks);
    expect(analogHostHooks(compiler())).toBeUndefined();
    expect(analogHostHooks(compiler({ claimFilesystemChange: undefined }))).toBeUndefined();
    expect(analogHostHooks(compiler(null))).toBeUndefined();
    expect(analogHostHooks(undefined)).toBeUndefined();
  });
});

describe('claimed filesystem changes of generated modules', () => {
  it('claims exactly what the host claims, and nothing once disposed', async () => {
    const generated = path.join('/workspace/generated', 'guides/page.ts');
    const hooks: { passes: number; claimFilesystemChange?: (file: string) => boolean } = {
      passes: 0,
    };
    const claims = vi.fn((file: string) => file === generated);
    const composition = composeAngularPlugins([compiler(hooks)], await probe(), bridge(claims));
    expect(hooks.claimFilesystemChange).toBeTypeOf('function');
    expect(hooks.claimFilesystemChange?.(generated)).toBe(true);
    expect(hooks.claimFilesystemChange?.('/workspace/src/app.ts')).toBe(false);
    expect(claims).toHaveBeenCalledTimes(2);
    await composition.dispose();
    expect(hooks.claimFilesystemChange).toBeUndefined();
  });

  it('claims nothing for a host that cannot tell generated modules apart', async () => {
    const hooks: { passes: number; claimFilesystemChange?: (file: string) => boolean } = {
      passes: 0,
    };
    const composition = composeAngularPlugins([compiler(hooks)], await probe(), bridge());
    expect(hooks.claimFilesystemChange?.('/workspace/generated/routes.ts')).toBe(false);
    await composition.dispose();
  });

  it(`leaves every filesystem change to Analog with ${ANGULAR_STRUCTURAL_PASS_FLAG}=0`, async () => {
    vi.stubEnv(ANGULAR_STRUCTURAL_PASS_FLAG, '0');
    const hooks: { passes: number; claimFilesystemChange?: (file: string) => boolean } = {
      passes: 0,
    };
    const composition = composeAngularPlugins(
      [compiler(hooks)],
      await probe(),
      bridge(() => true),
    );
    expect(hooks.claimFilesystemChange).toBeUndefined();
    await composition.dispose();
    expect(hooks.claimFilesystemChange).toBeUndefined();
  });

  it('composes a compiler without the hooks as before', async () => {
    const plain = compiler();
    const composition = composeAngularPlugins(
      [plain],
      await probe(),
      bridge(() => true),
    );
    expect(plain.api).toBeUndefined();
    await composition.dispose();
  });
});

describe('generated outputs of the host update coordinator', () => {
  const manifest = (generation: number): OutputManifest =>
    ({ generation, files: [] }) as unknown as OutputManifest;

  it('are the paths below the published output root, and none before or after', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-structural-output-'));
    temporary.push(root);
    const output = path.join(root, 'generated');
    await mkdir(output);
    const coordinator = new HostUpdateCoordinator(
      () => {},
      () => {},
    );
    expect(coordinator.generated(path.join(output, 'routes.ts'))).toBe(false);
    coordinator.seed(output, manifest(1));
    expect(coordinator.generated(path.join(output, 'routes.ts'))).toBe(true);
    expect(coordinator.generated(path.join(output, 'guides/new/page.ts'))).toBe(true);
    expect(coordinator.generated(output)).toBe(false);
    expect(coordinator.generated(path.join(root, 'generated-sibling/page.ts'))).toBe(false);
    expect(coordinator.generated(path.join(root, 'docs/ng-doc.page.ts'))).toBe(false);
    coordinator.dispose();
    expect(coordinator.generated(path.join(output, 'routes.ts'))).toBe(false);
  });
});

describe('filesystem changes the Vite adapter leaves to the pass of their generation', () => {
  it('are the description modules the generator watches, and none once disposed', async () => {
    const lifecycle = new ViteAdapterLifecycle({ dispose() {} } as unknown as OutputLease);
    const docs = '/workspace/docs';
    const watched = vi.fn((change: { path: string }) => change.path.startsWith(docs));
    // Before a server is attached nothing is known to be watched.
    expect(lifecycle.hostClaimsFilesystemChange(path.join(docs, 'guide/ng-doc.page.ts'))).toBe(
      false,
    );
    lifecycle.attachServer(
      {} as never,
      { matches: watched, dispose: async () => {} } as unknown as ViteFileEventSource,
    );
    for (const name of ['ng-doc.page.ts', 'ng-doc.category.ts', 'ng-doc.api.ts'])
      expect(lifecycle.hostClaimsFilesystemChange(path.join(docs, 'guide', name))).toBe(true);
    // A demo or any other source of the documentation compiles as before.
    expect(lifecycle.hostClaimsFilesystemChange(path.join(docs, 'guide/demo.component.ts'))).toBe(
      false,
    );
    expect(lifecycle.hostClaimsFilesystemChange(path.join(docs, 'guide/ng-doc.page.tsx'))).toBe(
      false,
    );
    // A description module the generator does not watch is not its own.
    expect(lifecycle.hostClaimsFilesystemChange('/elsewhere/ng-doc.page.ts')).toBe(false);
    // Nothing is published yet, so no path is a generated output.
    expect(lifecycle.hostClaimsFilesystemChange('/workspace/generated/routes.ts')).toBe(false);
    await lifecycle.dispose();
    expect(lifecycle.hostClaimsFilesystemChange(path.join(docs, 'guide/ng-doc.page.ts'))).toBe(
      false,
    );
  });
});

describe('description modules the committed generation read', () => {
  /**
   * A successful result whose page shell read `modules` (content dependencies).
   * @param generation The generation.
   * @param modules The description modules it read.
   */
  const success = (
    generation: number,
    modules: string[],
  ): Extract<BuildResult, { status: 'success' }> =>
    ({
      status: 'success',
      generation,
      snapshot: {
        projectId: 'structural',
        revision: String(generation),
        artifacts: [
          {
            dependencies: [
              ...modules.map((file) => ({ kind: 'content', path: file, digest: 'd' })),
              // Read, but no description module: never a reason to compile on its own.
              { kind: 'content', path: '/workspace/docs/guide/index.md', digest: 'd' },
              // Observed only: discovery found no such module.
              { kind: 'existence', path: '/workspace/docs/gone/ng-doc.page.ts', exists: false },
            ],
          },
        ],
        globalKeywords: [],
        remoteKeywords: [],
      },
      manifest: { generation, files: [] },
      diagnostics: [],
      whyRebuilt: [],
    }) as unknown as Extract<BuildResult, { status: 'success' }>;

  it('compiles the add event of an existing one in its own pass, and claims new and deleted ones', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-structural-read-'));
    temporary.push(root);
    const docs = path.join(root, 'docs');
    const output = path.join(root, 'generated');
    const guide = path.join(docs, 'guide/ng-doc.page.ts');
    const added = path.join(docs, 'added/ng-doc.page.ts');
    const category = path.join(docs, 'ng-doc.category.ts');
    await mkdir(path.dirname(guide), { recursive: true });
    await mkdir(path.dirname(added), { recursive: true });
    await writeFile(guide, 'export default {};\n');
    await writeFile(added, 'export default {};\n');
    await writeFile(category, 'export default {};\n');
    const lease = { admit() {}, seal() {}, dispose() {} } as unknown as OutputLease;
    const lifecycle = new ViteAdapterLifecycle(lease);
    const observed = vi.fn(async () => ({ accepted: false }));
    lifecycle.attachServer(
      { ws: { send() {} }, config: { logger: { error() {}, warn() {}, info() {} } } } as never,
      {
        matches: (change: { path: string }) => change.path.startsWith(docs),
        observe: observed,
        excludeOwned() {},
        started() {},
        dispose: async () => {},
      } as unknown as ViteFileEventSource,
    );
    const configuration = {
      outputRoot: output,
      cacheRoot: path.join(root, 'cache'),
      assetDirectory: 'assets',
      themes: { light: 'light', dark: 'dark' },
      digest: 'c',
    };
    // Nothing committed yet: every watched description module is claimed.
    expect(lifecycle.hostClaimsFilesystemChange(guide)).toBe(true);
    lifecycle.publish(success(1, [guide, category]), configuration);
    // Read and present: the page shell imports it, so a replacement compiles in its own pass.
    expect(lifecycle.hostClaimsFilesystemChange(guide)).toBe(false);
    expect(lifecycle.hostClaimsFilesystemChange(category)).toBe(false);
    // Not read by the committed generation: nothing generated imports it yet.
    expect(lifecycle.hostClaimsFilesystemChange(added)).toBe(true);
    // Read but deleted: no bytes left to compile; the commit that drops it takes the pass.
    await rm(category);
    expect(lifecycle.hostClaimsFilesystemChange(category)).toBe(true);
    // A newer commit that reads the added page and no longer the guide (published or not).
    const observer = lifecycle.observer(() => configuration);
    observer({ kind: 'result', result: success(3, [added]) });
    expect(lifecycle.hostClaimsFilesystemChange(added)).toBe(false);
    expect(lifecycle.hostClaimsFilesystemChange(guide)).toBe(true);
    // An older result arriving late never replaces it.
    observer({ kind: 'result', result: success(2, [guide]) });
    expect(lifecycle.hostClaimsFilesystemChange(added)).toBe(false);
    expect(lifecycle.hostClaimsFilesystemChange(guide)).toBe(true);
    await lifecycle.settled();
    expect(observed).toHaveBeenCalledTimes(2);
    await lifecycle.dispose();
    expect(lifecycle.hostClaimsFilesystemChange(added)).toBe(false);
  });
});
