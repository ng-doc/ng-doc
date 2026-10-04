import { logging } from '@angular-devkit/core';
import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { APP_COMPONENT_CONTENT } from '../constants/app-component-content';
import { NG_DOC_STYLES } from '../constants/styles';
import { Schema } from '../schema';
import { KEEP_ANOTHER_BUILDER_URL } from '../utils/select-engine';
import { createRunner } from './ng-add-runner';

/*
 * A builder that is neither Angular's nor NgDoc's is kept: replacing it would break the
 * application. Native federation is the common case: its `build` runs Angular's application
 * builder from the `esbuild` target and its `serve` runs the dev server from `serve-original`,
 * the shape its `ng add` writes.
 */

const OPTIONS: Schema = { project: '' };

const FEDERATION_BUILDER = '@angular-architects/native-federation:build';

const ESBUILD_TARGET = {
  builder: '@angular/build:application',
  options: {
    browser: 'src/main.ts',
    tsConfig: 'tsconfig.app.json',
    polyfills: ['es-module-shims'],
    assets: [{ glob: '**/*', input: 'public' }],
    styles: ['src/styles.css'],
  },
  configurations: {
    production: {
      budgets: [
        { type: 'initial', maximumWarning: '500kB', maximumError: '1MB' },
        { type: 'anyComponentStyle', maximumWarning: '4kB', maximumError: '8kB' },
      ],
      outputHashing: 'all',
    },
    development: { optimization: false, extractLicenses: false, sourceMap: true },
  },
  defaultConfiguration: 'production',
};

const FEDERATION_TARGETS = {
  build: {
    builder: FEDERATION_BUILDER,
    options: {},
    configurations: {
      production: { target: 'shell:esbuild:production' },
      development: { target: 'shell:esbuild:development', dev: true },
    },
    defaultConfiguration: 'production',
  },
  esbuild: ESBUILD_TARGET,
  serve: {
    builder: FEDERATION_BUILDER,
    options: {
      target: 'shell:serve-original:development',
      rebuildDelay: 0,
      dev: true,
      port: 0,
    },
  },
  'serve-original': {
    builder: '@angular/build:dev-server',
    configurations: {
      production: { buildTarget: 'shell:esbuild:production' },
      development: { buildTarget: 'shell:esbuild:development' },
    },
    defaultConfiguration: 'development',
    options: { port: 4200 },
  },
};

/** The entry of a federation application: it loads the manifest, then the application. */
const FEDERATION_MAIN = `import { initFederation } from '@angular-architects/native-federation';

initFederation('federation.manifest.json')
  .catch((err) => console.error(err))
  .then((_) => import('./bootstrap'))
  .catch((err) => console.error(err));
`;

const BOOTSTRAP = `import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
`;

const APP_CONFIG = `import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes)]
};
`;

interface Target {
  builder: string;
  options?: Record<string, unknown>;
  configurations?: Record<string, Record<string, unknown>>;
}

describe('ng-add next to a builder NgDoc does not replace', () => {
  let host: UnitTestTree;
  let runner: SchematicTestRunner;
  let messages: logging.LogEntry[];

  /**
   * Creates the workspace with the given targets.
   * @param targets - The targets of the `shell` application.
   */
  function createWorkspace(targets: Record<string, unknown>): void {
    host.create(
      'angular.json',
      JSON.stringify(
        {
          version: 1,
          projects: {
            shell: { projectType: 'application', root: '', sourceRoot: 'src', architect: targets },
          },
        },
        null,
        2,
      ),
    );
  }

  /**
   * The targets of the application.
   * @param tree - The tree after the schematic ran.
   */
  function targets(tree: UnitTestTree): Record<string, Target> {
    return JSON.parse(tree.readContent('angular.json')).projects.shell.architect;
  }

  /** The logged messages. */
  function logged(): string {
    return messages.map((entry: logging.LogEntry) => entry.message).join('\n');
  }

  beforeEach(() => {
    host = new UnitTestTree(new HostTree());
    runner = createRunner();
    messages = [];
    runner.logger.subscribe((entry: logging.LogEntry) => messages.push(entry));

    host.create('package.json', '{"dependencies": {"@angular/core": "^22.0.0"}}');
    host.create('tsconfig.json', '{\n  "compilerOptions": {}\n}');
    host.create('tsconfig.app.json', '{\n  "extends": "./tsconfig.json"\n}');
    host.create('src/main.ts', FEDERATION_MAIN);
    host.create('src/bootstrap.ts', BOOTSTRAP);
    host.create('src/app/app.config.ts', APP_CONFIG);
    host.create(
      'src/app/app.ts',
      `import { Component } from '@angular/core';

@Component({selector: 'app-root', imports: [], templateUrl: './app.html'})
export class App {}
`,
    );
    host.create('src/app/app.html', '<router-outlet />');
    host.create(
      'src/app/app.routes.ts',
      `import { Routes } from '@angular/router';

export const routes: Routes = [];
`,
    );
  });

  it('keeps the native federation builders and sets up the rest on the esbuild target', async () => {
    createWorkspace(FEDERATION_TARGETS);

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const after = targets(tree);

    // The builders and their own options are as they were.
    expect(after['build']).toEqual(FEDERATION_TARGETS.build);
    expect(after['serve']).toEqual(FEDERATION_TARGETS.serve);
    expect(after['serve-original']).toEqual(FEDERATION_TARGETS['serve-original']);
    expect(Object.keys(after).sort()).toEqual(['build', 'esbuild', 'serve', 'serve-original']);
    expect(JSON.stringify(after)).not.toContain('@ng-doc/builder');
    expect(tree.exists('vite.config.mjs')).toBe(false);

    // The Angular build options are on the esbuild target, which the federation build runs.
    const esbuild = after['esbuild'];

    expect(esbuild.builder).toBe('@angular/build:application');
    expect(esbuild.options?.['styles']).toEqual([...NG_DOC_STYLES, 'src/styles.css']);
    expect(esbuild.options?.['assets']).toEqual([
      { glob: '**/*', input: 'node_modules/@ng-doc/app/assets', output: 'assets/ng-doc/app' },
      { glob: '**/*', input: 'node_modules/@ng-doc/ui-kit/assets', output: 'assets/ng-doc/ui-kit' },
      { glob: '**/*', input: 'ng-doc/shell/assets', output: 'assets/ng-doc' },
      { glob: '**/*', input: 'public' },
    ]);
    expect(esbuild.options?.['allowedCommonJsDependencies']).toEqual(['@ng-doc/core']);
    expect(esbuild.configurations?.['production']['budgets']).toEqual([
      { type: 'initial', maximumWarning: '500kB', maximumError: '5mb' },
      { type: 'anyComponentStyle', maximumWarning: '4kB', maximumError: '8kB' },
    ]);

    // The providers and the layout go into the application that `bootstrap.ts` starts.
    expect(tree.readContent('src/main.ts')).toEqual(FEDERATION_MAIN);
    expect(tree.readContent('src/app/app.config.ts')).toContain('provideNgDocApp()');
    expect(tree.readContent('src/app/app.html')).toEqual(APP_COMPONENT_CONTENT);
    expect(JSON.parse(tree.readContent('tsconfig.json')).compilerOptions.paths).toEqual({
      '@ng-doc/generated': ['./ng-doc/shell/index.ts'],
      '@ng-doc/generated/*': ['./ng-doc/shell/*'],
    });

    // The output says why, and where the recipe is.
    expect(logged()).toContain(
      `The "build" target uses "${FEDERATION_BUILDER}", which NgDoc doesn't replace`,
    );
    expect(logged()).toContain(`Engine: the "ng-doc" command, next to "${FEDERATION_BUILDER}"`);
    expect(logged()).toContain(KEEP_ANOTHER_BUILDER_URL);
    expect(logged()).not.toContain('Replacing Angular CLI builders');
  });

  it('changes nothing when it runs a second time', async () => {
    createWorkspace(FEDERATION_TARGETS);

    const first: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const files = (tree: UnitTestTree): Record<string, string> =>
      Object.fromEntries(tree.files.map((file: string) => [file, tree.readContent(file)]));
    const before = files(first);
    const second: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, first);

    expect(files(second)).toEqual(before);
  });

  it('keeps a custom serve builder next to Angular’s application builder', async () => {
    createWorkspace({
      build: ESBUILD_TARGET,
      serve: {
        builder: '@my-org/builders:dev-server',
        options: { buildTarget: 'shell:build:development' },
      },
    });

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const after = targets(tree);

    expect(after['build'].builder).toBe('@angular/build:application');
    expect(after['serve'].builder).toBe('@my-org/builders:dev-server');
    expect(after['build'].options?.['styles']).toEqual([...NG_DOC_STYLES, 'src/styles.css']);
    expect(logged()).toContain(
      `The "serve" target uses "@my-org/builders:dev-server", which NgDoc doesn't replace`,
    );
  });

  it('sets up the legacy builders on request, as before', async () => {
    createWorkspace(FEDERATION_TARGETS);

    const tree: UnitTestTree = await runner.runSchematic(
      'ng-add-setup-project',
      { ...OPTIONS, engine: 'legacy' },
      host,
    );

    expect(targets(tree)['build'].builder).toBe('@ng-doc/builder:application');
    expect(targets(tree)['serve'].builder).toBe('@ng-doc/builder:dev-server');
    expect(logged()).not.toContain(KEEP_ANOTHER_BUILDER_URL);
  });

  // Nx's application executor gets the Vite engine (ng-add-nx-workspace.spec.ts).
  it('still replaces Nx’s other executors that run Angular’s builders', async () => {
    createWorkspace({
      build: { ...ESBUILD_TARGET, builder: '@nx/angular:browser-esbuild' },
      serve: { builder: '@nx/angular:dev-server', options: {} },
    });

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(targets(tree)['build'].builder).toBe('@ng-doc/builder:application');
    expect(targets(tree)['serve'].builder).toBe('@ng-doc/builder:dev-server');
    expect(logged()).not.toContain(KEEP_ANOTHER_BUILDER_URL);
  });
});
