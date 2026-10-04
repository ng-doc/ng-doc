import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HmrContext } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NgDocVitePluginOptions } from '..';

// The Vite that NgDoc resolves, switchable per test. The real one is 8.3.2 (the root lockfile).
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
import {
  assertSupportedViteVersion,
  isSupportedViteVersion,
  SUPPORTED_VITE_RANGE,
} from '../vite-version';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const manifest = JSON.parse(
  readFileSync(path.join(repository, 'libs/builder/package.json'), 'utf8'),
) as {
  peerDependencies: Record<string, string>;
  'ng-doc': { viteEngine: Record<string, string> };
};

const REQUIRED = new RegExp(
  `^\\[NGDOC_VITE_VERSION\\] The NgDoc Vite engine requires vite \\^8\\.3\\.0, but vite 7\\.3\\.5 is running\\. ` +
    `Install a supported release in the application's devDependencies: npm i -D vite@\\^8\\.3\\.0\\. ` +
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
  it('is the range the setup schematics install, inside the optional peer range', () => {
    expect(SUPPORTED_VITE_RANGE).toBe('^8.3.0');
    expect(manifest['ng-doc'].viteEngine['vite']).toBe(SUPPORTED_VITE_RANGE);
  });

  it("has Analog's optional peer range, which admits the Vite of every Angular 22 build", () => {
    // Before the migration adds `vite@^8.3.0`, the Vite at the root of the application is the one
    // its `@angular/build` brings: npm refuses to install NgDoc next to it when the peer excludes it.
    const analog = JSON.parse(
      readFileSync(
        path.join(repository, 'node_modules/@analogjs/vite-plugin-angular/package.json'),
        'utf8',
      ),
    ) as { peerDependencies: Record<string, string> };
    expect(manifest.peerDependencies['vite']).toBe(analog.peerDependencies['vite']);
    const majors = manifest.peerDependencies['vite']!.split('||').map((range) => {
      const match = /^\^(\d+)\.0\.0$/.exec(range.trim());
      expect(match, range).not.toBeNull();
      return Number(match![1]);
    });
    // @angular/build 22.0 brings Vite 7.3, 22.1 Vite 8.1 and 22.2 Vite 8.3.
    for (const found of ['7.3.2', '7.3.6', '8.1.5', '8.3.2']) {
      expect([found, majors.includes(Number(found.split('.')[0]))]).toEqual([found, true]);
    }
  });

  it('accepts every Vite 8 release from 8.3.0 and nothing else', () => {
    expect(() => assertSupportedViteVersion()).not.toThrow();
    expect(() => assertSupportedViteVersion(undefined)).not.toThrow();
    for (const found of ['8.3.0', '8.3.2', '8.4.0', '8.10.1', '8.4.0-beta.1', '8.3.1+build.5'])
      expect(isSupportedViteVersion(found), found).toBe(true);
    for (const found of [
      '7.3.5',
      '8.2.9',
      '8.0.0',
      '9.0.0',
      '6.4.1',
      '8.3.0-beta.1',
      '8.3',
      'v8.3.2',
      '',
    ]) {
      expect(isSupportedViteVersion(found), found).toBe(false);
      if (found)
        expect(() => assertSupportedViteVersion(found)).toThrow(
          `[NGDOC_VITE_VERSION] The NgDoc Vite engine requires vite ^8.3.0, but vite ${found} is running.`,
        );
    }
  });

  it('names the found and the required version and the fix', () => {
    expect(() => assertSupportedViteVersion('7.3.5')).toThrow(REQUIRED);
  });

  it('names an unknown version', () => {
    vite.version = '';
    expect(() => assertSupportedViteVersion()).toThrow(/but vite \(unknown version\) is running/);
  });

  it('stops the plugin before any option check or generator work on another Vite', () => {
    vite.version = '7.3.5';
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
    expect(() => config.call({ meta: { viteVersion: '7.3.5' } }, {}, environment)).toThrow(
      REQUIRED,
    );
    expect(() => config.call({ meta: { viteVersion: '8.3.2' } }, {}, environment)).not.toThrow();
    // Older hosts call the hook without a context; the version checked at creation stands.
    expect(() => config.call(undefined, {}, environment)).not.toThrow();
    expect(bootstrap.create).not.toHaveBeenCalled();
  });

  it('stops the production pipeline before it touches the output', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-vite-version-'));
    try {
      await writeFile(path.join(output, 'keep.txt'), 'kept');
      vite.version = '7.3.5';
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
