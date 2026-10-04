import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HmrContext } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NgDocVitePluginOptions } from '..';

// The `@angular/compiler-cli` NgDoc resolves, switchable per test: a version, `null` for none
// installed, `undefined` for the real one (22.2.1, the root lockfile).
const angular = vi.hoisted(() => ({ version: undefined as string | null | undefined }));

vi.mock('node:module', async (original) => {
  const actual = await original<typeof import('node:module')>();
  const createRequire = (from: string | URL): NodeJS.Require => {
    const require = actual.createRequire(from);
    const replaced = ((id: string) => {
      if (id !== '@angular/compiler-cli/package.json' || angular.version === undefined)
        return require(id);
      if (angular.version === null) {
        throw Object.assign(new Error(`Cannot find module '${id}'`), { code: 'MODULE_NOT_FOUND' });
      }
      return { name: '@angular/compiler-cli', version: angular.version };
    }) as NodeJS.Require;
    return Object.assign(replaced, require);
  };
  return { ...actual, createRequire, default: { ...actual, createRequire } };
});

const bootstrap = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../../bootstrap', async (original) => ({
  ...(await original<typeof import('../../bootstrap')>()),
  createGeneratorBuildSession: bootstrap.create,
}));

import { buildNgDocViteApplication, createNgDocVitePlugin } from '..';
import { qualifyAngularPlugins } from '../angular-compatibility';
import {
  assertSupportedAngularVersion,
  isSupportedAngularCompilerVersion,
  MINIMUM_ANGULAR_COMPILER,
  resolveAngularCompilerVersion,
} from '../angular-version';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const manifest = JSON.parse(
  readFileSync(path.join(repository, 'libs/builder/package.json'), 'utf8'),
) as {
  peerDependencies: Record<string, string>;
  'ng-doc': { viteEngine: Record<string, string> };
};
const installed = (
  JSON.parse(
    readFileSync(path.join(repository, 'node_modules/@angular/compiler-cli/package.json'), 'utf8'),
  ) as { version: string }
).version;

const REQUIRED = new RegExp(
  '^\\[NGDOC_VITE_ANGULAR_VERSION\\] The NgDoc Vite engine requires Angular 22\\.2 or later ' +
    '\\(@angular/compiler-cli >=22\\.2\\.0\\), but @angular/compiler-cli 22\\.1\\.3 is installed\\. ' +
    'Update Angular: ng update @angular/core@22 @angular/cli@22\\.$',
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
      projectId: 'angular-version',
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
  angular.version = undefined;
  bootstrap.create.mockReset();
});

describe('the supported Angular version', () => {
  it('is the lower bound of the Vite engine ranges, while the peers admit any Angular 22', () => {
    expect(MINIMUM_ANGULAR_COMPILER).toBe('22.2.0');
    for (const name of ['@angular/compiler', '@angular/compiler-cli']) {
      expect([name, manifest['ng-doc'].viteEngine[name]]).toEqual([
        name,
        `^${MINIMUM_ANGULAR_COMPILER}`,
      ]);
      // The legacy engine runs on Angular 22.0 and 22.1: npm must not refuse to install the builder.
      expect([name, manifest.peerDependencies[name]]).toEqual([name, '>=22.0.0 <23.0.0']);
    }
  });

  it('accepts @angular/compiler-cli from 22.2.0, prereleases included, as Analog does', () => {
    for (const found of ['22.2.0', '22.2.1', '22.10.0', '23.0.0', '22.2.0-next.1', '22.3.0+sha.1'])
      expect(isSupportedAngularCompilerVersion(found), found).toBe(true);
    for (const found of ['22.1.9', '22.0.0', '21.2.5', '22.1.0-rc.0', '22.2', 'v22.2.0', '']) {
      expect(isSupportedAngularCompilerVersion(found), found).toBe(false);
      if (found)
        expect(() => assertSupportedAngularVersion(found)).toThrow(
          `but @angular/compiler-cli ${found} is installed.`,
        );
    }
  });

  it('names the found and the required version and the fix', () => {
    expect(() => assertSupportedAngularVersion('22.1.3')).toThrow(REQUIRED);
  });

  it('reads the @angular/compiler-cli that NgDoc resolves', () => {
    expect(resolveAngularCompilerVersion()).toBe(installed);
    expect(() => assertSupportedAngularVersion()).not.toThrow();
    angular.version = '22.0.6';
    expect(resolveAngularCompilerVersion()).toBe('22.0.6');
    expect(() => assertSupportedAngularVersion()).toThrow(
      'but @angular/compiler-cli 22.0.6 is installed.',
    );
  });

  it('names a missing @angular/compiler-cli', () => {
    angular.version = null;
    expect(resolveAngularCompilerVersion()).toBeUndefined();
    expect(() => assertSupportedAngularVersion()).toThrow(
      /^\[NGDOC_VITE_ANGULAR_VERSION\] .*, but @angular\/compiler-cli is not installed\. Update Angular/,
    );
  });

  it('stops the plugin before any option check or generator work on an older Angular', () => {
    angular.version = '22.1.3';
    expect(() => createNgDocVitePlugin(pluginOptions('/tmp/ng-doc-angular-version'))).toThrow(
      REQUIRED,
    );
    // Even before invalid options are reported: Analog fails on them in misleading ways.
    expect(() => createNgDocVitePlugin({} as NgDocVitePluginOptions)).toThrow(REQUIRED);
    expect(bootstrap.create).not.toHaveBeenCalled();
  });

  it('stops the production pipeline before it touches the output', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-angular-version-'));
    try {
      await writeFile(path.join(output, 'keep.txt'), 'kept');
      angular.version = '22.1.3';
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
