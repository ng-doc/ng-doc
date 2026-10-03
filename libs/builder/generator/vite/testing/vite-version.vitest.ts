import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HmrContext } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NgDocVitePluginOptions } from '..';

// The Vite that NgDoc resolves, switchable per test. The real one is 7.3.5 (the root lockfile).
const vite = vi.hoisted(() => ({ version: undefined as string | undefined }));

vi.mock('vite', async (original) => {
  const actual = await original<typeof import('vite')>();
  return {
    ...actual,
    get version() {
      return vite.version ?? actual.version;
    },
  };
});

const bootstrap = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../../bootstrap', async (original) => ({
  ...(await original<typeof import('../../bootstrap')>()),
  createGeneratorBuildSession: bootstrap.create,
}));

import { buildNgDocViteApplication, createNgDocVitePlugin } from '..';
import { qualifyAngularPlugins } from '../angular-compatibility';
import { assertSupportedViteVersion, SUPPORTED_VITE_VERSION } from '../vite-version';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const manifest = JSON.parse(
  readFileSync(path.join(repository, 'libs/builder/package.json'), 'utf8'),
) as {
  peerDependencies: Record<string, string>;
  'ng-doc': { viteEngine: Record<string, string> };
};

const REQUIRED = new RegExp(
  `^\\[NGDOC_VITE_VERSION\\] The NgDoc Vite engine requires vite 7\\.3\\.5, but vite 8\\.3\\.2 is running\\. ` +
    `Pin it in the application's devDependencies: npm i -D vite@7\\.3\\.5\\. ` +
    'The legacy builders \\(@ng-doc/builder:application and dev-server\\) do not use Vite\\.$',
);

function pluginOptions(workspace: string): NgDocVitePluginOptions {
  return {
    analogLiveReload: true,
    angularPlugins: qualifyAngularPlugins([
      {
        name: '@analogjs/vite-plugin-angular',
        buildStart() {},
        handleHotUpdate(context: HmrContext) {
          return context.modules;
        },
        transform() {
          return null;
        },
      },
    ]),
    angularComponentProbe: path.join(workspace, 'app.component.ts'),
    generator: {
      projectId: 'vite-version',
      workspaceRoot: workspace,
      defaults: {
        docsRoot: path.join(workspace, 'docs'),
        tsConfig: path.join(workspace, 'tsconfig.json'),
        outputRoot: path.join(workspace, 'generated'),
        cacheRoot: path.join(workspace, 'cache'),
      },
    },
  };
}

afterEach(() => {
  vite.version = undefined;
  bootstrap.create.mockReset();
});

describe('the supported Vite version', () => {
  it('is the exact version the setup schematics install, inside the optional peer range', () => {
    expect(SUPPORTED_VITE_VERSION).toBe('7.3.5');
    expect(manifest['ng-doc'].viteEngine['vite']).toBe(SUPPORTED_VITE_VERSION);
    // The peer admits the Vite 8 that Vitest and Angular's own tooling pull in, so the install
    // never fails on it; the engine checks the exact version when it starts.
    expect(manifest.peerDependencies['vite']).toBe('^7.3.5 || ^8.0.0');
  });

  it('accepts exactly the supported version', () => {
    expect(() => assertSupportedViteVersion('7.3.5')).not.toThrow();
    expect(() => assertSupportedViteVersion()).not.toThrow();
    for (const found of ['7.3.6', '7.3.4', '8.3.2', '8.0.0', '6.4.1', '7.3.5-beta.0']) {
      expect(() => assertSupportedViteVersion(found)).toThrow(
        `[NGDOC_VITE_VERSION] The NgDoc Vite engine requires vite 7.3.5, but vite ${found} is running.`,
      );
    }
    expect(() => assertSupportedViteVersion(undefined)).not.toThrow();
  });

  it('names the found and the required version and the fix', () => {
    expect(() => assertSupportedViteVersion('8.3.2')).toThrow(REQUIRED);
  });

  it('names an unknown version', () => {
    vite.version = '';
    expect(() => assertSupportedViteVersion()).toThrow(/but vite \(unknown version\) is running/);
  });

  it('stops the plugin before any option check or generator work on another Vite', () => {
    vite.version = '8.3.2';
    expect(() => createNgDocVitePlugin(pluginOptions('/tmp/ng-doc-vite-version'))).toThrow(
      REQUIRED,
    );
    // Even before invalid options are reported: they could be a symptom of the wrong Vite.
    expect(() => createNgDocVitePlugin({} as NgDocVitePluginOptions)).toThrow(REQUIRED);
    expect(bootstrap.create).not.toHaveBeenCalled();
  });

  it('checks the Vite that runs the configuration when it reports its version', () => {
    const [plugin] = createNgDocVitePlugin(pluginOptions(path.resolve('/tmp/ng-doc-vite-host')));
    const config = plugin!.config as (
      this: unknown,
      config: object,
      environment: { command: 'serve' | 'build'; mode: string },
    ) => unknown;
    const environment = { command: 'build' as const, mode: 'production' };
    expect(() => config.call({ meta: { viteVersion: '8.3.2' } }, {}, environment)).toThrow(
      REQUIRED,
    );
    expect(() => config.call({ meta: { viteVersion: '7.3.5' } }, {}, environment)).not.toThrow();
    // Older hosts call the hook without a context; the version checked at creation stands.
    expect(() => config.call(undefined, {}, environment)).not.toThrow();
    expect(bootstrap.create).not.toHaveBeenCalled();
  });

  it('stops the production pipeline before it touches the output', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-vite-version-'));
    try {
      await writeFile(path.join(output, 'keep.txt'), 'kept');
      vite.version = '8.3.2';
      const build = vi.fn();
      await expect(
        buildNgDocViteApplication(
          { configFile: path.join(output, 'vite.config.mjs'), outputPath: output },
          { build } as never,
        ),
      ).rejects.toThrow(REQUIRED);
      expect(build).not.toHaveBeenCalled();
      expect(await readdir(output)).toEqual(['keep.txt']);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});
