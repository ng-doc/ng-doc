import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HmrContext } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NgDocVitePluginOptions } from '..';

// The `@angular/compiler-cli` and `@angular/build` NgDoc resolves, switchable per test: a version,
// `null` for none installed, `undefined` for the real one (22.2.1, the root lockfile).
const angular = vi.hoisted(() => ({
  versions: {} as Record<string, string | null | undefined>,
}));

vi.mock('node:module', async (original) => {
  const actual = await original<typeof import('node:module')>();
  const createRequire = (from: string | URL): NodeJS.Require => {
    const require = actual.createRequire(from);
    const replaced = ((id: string) => {
      const name = /^(@angular\/(?:compiler-cli|build))\/package\.json$/.exec(id)?.[1];
      const version = name === undefined ? undefined : angular.versions[name];
      if (version === undefined) return require(id);
      if (version === null) {
        throw Object.assign(new Error(`Cannot find module '${id}'`), { code: 'MODULE_NOT_FOUND' });
      }
      return { name, version };
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
  assertConsistentAngularBuild,
  isConsistentAngularBuild,
  resolveAngularBuildVersion,
  resolveAngularCompilerVersion,
  TRANSFORM_OPTIONS_ANGULAR,
} from '../angular-version';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const manifest = JSON.parse(
  readFileSync(path.join(repository, 'libs/builder/package.json'), 'utf8'),
) as {
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  'ng-doc': { viteEngine: Record<string, string> };
};
const installed = (name: string): string =>
  (
    JSON.parse(
      readFileSync(path.join(repository, 'node_modules', name, 'package.json'), 'utf8'),
    ) as { version: string }
  ).version;

const MISMATCH = new RegExp(
  '^\\[NGDOC_VITE_ANGULAR_VERSION\\] NgDoc resolves @angular/compiler-cli 22\\.1\\.3 and ' +
    '@angular/build 22\\.2\\.1, which belong to different Angular releases: .* both must be ' +
    'from before 22\\.2\\.0 or both from 22\\.2\\.0 or later\\. .*`npm ls @angular/build`.*' +
    'ng update @angular/core@22 @angular/cli@22.*deduplicate @angular/build',
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
  angular.versions = {};
  bootstrap.create.mockReset();
});

describe('the Angular build the Vite engine drives', () => {
  it("is the application's own: the builder takes any Angular 22 build", () => {
    // A dependency of NgDoc's own (exact, or a range Yarn 1 resolves to the newest release)
    // installs a second `@angular/build` next to an application on another Angular 22 release,
    // which Analog then drives through the application's compiler version. A required peer is
    // always the application's copy.
    expect(manifest.dependencies['@angular/build']).toBeUndefined();
    expect(manifest.peerDependencies['@angular/build']).toBe('>=22.0.0 <23.0.0');
    expect(
      (manifest as { peerDependenciesMeta?: Record<string, unknown> }).peerDependenciesMeta?.[
        '@angular/build'
      ],
    ).toBeUndefined();
    // The devkit packages dedupe with the application's where the package manager can.
    expect(manifest.dependencies['@angular-devkit/core']).toBe('>=22.0.0 <23.0.0');
    expect(manifest.dependencies['@angular-devkit/architect']).toBe('>=0.2200.0 <0.2300.0');
    for (const name of ['@angular/compiler', '@angular/compiler-cli']) {
      expect([name, manifest['ng-doc'].viteEngine[name]]).toEqual([name, '^22.0.0']);
      expect([name, manifest.peerDependencies[name]]).toEqual([name, '>=22.0.0 <23.0.0']);
    }
  });

  it('accepts a compiler and a build on the same side of 22.2.0, as Analog drives them', () => {
    expect(TRANSFORM_OPTIONS_ANGULAR).toBe('22.2.0');
    const consistent: Array<[string, string]> = [
      ['22.0.6', '22.0.6'],
      ['22.1.4', '22.1.6'],
      ['22.0.6', '22.1.9'],
      ['22.2.1', '22.2.1'],
      ['22.2.0', '22.10.0'],
      ['22.2.0-next.1', '22.3.0+sha.1'],
      ['23.0.0', '23.1.0'],
    ];
    for (const [compiler, build] of consistent) {
      expect([compiler, build, isConsistentAngularBuild(compiler, build)]).toEqual([
        compiler,
        build,
        true,
      ]);
      expect(() => assertConsistentAngularBuild(compiler, build)).not.toThrow();
    }
    const inconsistent: Array<[string, string]> = [
      ['22.1.3', '22.2.1'],
      ['22.0.6', '22.2.1'],
      ['22.2.1', '22.1.6'],
      ['22.1.0-rc.0', '22.2.0'],
      ['22.2.1', '23.0.0'],
      ['21.2.5', '22.0.0'],
      ['22.2', '22.2.1'],
      ['v22.2.0', '22.2.0'],
    ];
    for (const [compiler, build] of inconsistent) {
      expect([compiler, build, isConsistentAngularBuild(compiler, build)]).toEqual([
        compiler,
        build,
        false,
      ]);
      expect(() => assertConsistentAngularBuild(compiler, build)).toThrow(
        `NgDoc resolves @angular/compiler-cli ${compiler} and @angular/build ${build}`,
      );
    }
  });

  it('names both versions, the cause and the fix', () => {
    expect(() => assertConsistentAngularBuild('22.1.3', '22.2.1')).toThrow(MISMATCH);
  });

  it('reads the @angular/compiler-cli and the @angular/build that NgDoc resolves', () => {
    expect(resolveAngularCompilerVersion()).toBe(installed('@angular/compiler-cli'));
    expect(resolveAngularBuildVersion()).toBe(installed('@angular/build'));
    expect(() => assertConsistentAngularBuild()).not.toThrow();
    // An application on Angular 22.1 with a single, deduplicated @angular/build.
    angular.versions = { '@angular/compiler-cli': '22.1.4', '@angular/build': '22.1.6' };
    expect(resolveAngularCompilerVersion()).toBe('22.1.4');
    expect(resolveAngularBuildVersion()).toBe('22.1.6');
    expect(() => assertConsistentAngularBuild()).not.toThrow();
    // The same application with a second @angular/build installed for NgDoc.
    angular.versions['@angular/build'] = '22.2.1';
    expect(() => assertConsistentAngularBuild()).toThrow(
      'NgDoc resolves @angular/compiler-cli 22.1.4 and @angular/build 22.2.1',
    );
  });

  it('names a missing @angular/compiler-cli or @angular/build', () => {
    angular.versions = { '@angular/compiler-cli': null };
    expect(resolveAngularCompilerVersion()).toBeUndefined();
    expect(() => assertConsistentAngularBuild()).toThrow(
      /^\[NGDOC_VITE_ANGULAR_VERSION\] .*, but @angular\/compiler-cli is not installed\. Install it .*npm i -D @angular\/compiler-cli@22\.$/,
    );
    angular.versions = { '@angular/build': null };
    expect(resolveAngularBuildVersion()).toBeUndefined();
    expect(() => assertConsistentAngularBuild()).toThrow(
      /, but @angular\/build is not installed\. Install it .*npm i -D @angular\/build@22\.$/,
    );
  });

  it('stops the plugin before any option check or generator work on a mismatched build', () => {
    angular.versions = { '@angular/compiler-cli': '22.1.3', '@angular/build': '22.2.1' };
    expect(() => createNgDocVitePlugin(pluginOptions('/tmp/ng-doc-angular-version'))).toThrow(
      MISMATCH,
    );
    // Even before invalid options are reported: Analog fails on them in misleading ways.
    expect(() => createNgDocVitePlugin({} as NgDocVitePluginOptions)).toThrow(MISMATCH);
    expect(bootstrap.create).not.toHaveBeenCalled();
  });

  it('stops the production pipeline before it touches the output', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-angular-version-'));
    try {
      await writeFile(path.join(output, 'keep.txt'), 'kept');
      angular.versions = { '@angular/compiler-cli': '22.1.3', '@angular/build': '22.2.1' };
      const build = vi.fn();
      await expect(
        buildNgDocViteApplication(
          { configFile: path.join(output, 'vite.config.mjs'), outputPath: output },
          { build } as never,
        ),
      ).rejects.toThrow(MISMATCH);
      expect(build).not.toHaveBeenCalled();
      expect(await readdir(output)).toEqual(['keep.txt']);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});
