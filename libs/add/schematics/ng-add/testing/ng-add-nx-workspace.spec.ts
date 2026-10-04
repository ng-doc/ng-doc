import { logging, virtualFs } from '@angular-devkit/core';
import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { NG_DOC_STYLES } from '../constants/styles';
import { Schema } from '../schema';
import { createRunner } from './ng-add-runner';

/*
 * An Nx application whose targets run Nx's executors, `@nx/angular:application` and
 * `@nx/angular:dev-server`, which run Angular's builders with the same options. `nx g` shows
 * Angular devkit schematics a virtual angular.json built from every project.json (targets under
 * `architect`, with `builder` keys) and, when the tree is committed, writes that file's projects
 * over their project.json. The specs build the same view over files that exist outside the tree,
 * so an edit of angular.json is an overwrite, as it is under `nx g`.
 */

const PROJECT = {
  name: 'docs',
  $schema: '../../node_modules/nx/schemas/project-schema.json',
  projectType: 'application',
  prefix: 'app',
  sourceRoot: 'apps/docs/src',
  tags: [],
  targets: {
    build: {
      executor: '@nx/angular:application',
      outputs: ['{options.outputPath}'],
      defaultConfiguration: 'production',
      options: {
        outputPath: 'dist/apps/docs',
        browser: 'apps/docs/src/main.ts',
        tsConfig: 'apps/docs/tsconfig.app.json',
        inlineStyleLanguage: 'scss',
        assets: [{ glob: '**/*', input: 'apps/docs/public' }],
        styles: ['apps/docs/src/styles.scss'],
      } as Record<string, unknown>,
      configurations: {
        production: {
          budgets: [{ type: 'initial', maximumWarning: '500kb', maximumError: '1mb' }],
          outputHashing: 'all',
        },
        development: { optimization: false, extractLicenses: false, sourceMap: true },
      },
    },
    serve: {
      continuous: true,
      executor: '@nx/angular:dev-server',
      defaultConfiguration: 'development',
      options: {} as Record<string, unknown>,
      configurations: {
        production: { buildTarget: 'docs:build:production' },
        development: { buildTarget: 'docs:build:development' },
      },
    },
    'serve-static': {
      continuous: true,
      executor: '@nx/web:file-server',
      options: {
        buildTarget: 'docs:build',
        staticFilePath: 'dist/apps/docs/browser',
        spa: true,
      },
    },
  },
};

type Project = typeof PROJECT;

/**
 * The files of the Nx workspace, with the virtual angular.json of `nx g`.
 * @param project - The project.json of the application.
 */
function nxWorkspace(project: Project): Record<string, string> {
  const { name, targets, ...rest } = project;
  const architect = Object.fromEntries(
    Object.entries(targets).map(([target, { executor, ...options }]) => [
      target,
      { builder: executor, ...options },
    ]),
  );

  return {
    'package.json': JSON.stringify({ name: 'nx-docs', private: true, dependencies: {} }),
    'nx.json': JSON.stringify({ targetDefaults: {} }),
    'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }, null, 2),
    '.gitignore': '/node_modules\n/dist\n',
    'apps/docs/project.json': JSON.stringify(project, null, 2),
    'apps/docs/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.base.json' }, null, 2),
    'apps/docs/tsconfig.app.json': JSON.stringify({ extends: './tsconfig.json' }, null, 2),
    'apps/docs/src/index.html': '<html><head><base href="/"></head><body></body></html>\n',
    'apps/docs/src/styles.scss': '',
    'apps/docs/src/main.ts': `import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
`,
    'apps/docs/src/app/app.config.ts': `import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(appRoutes)],
};
`,
    'apps/docs/src/app/app.routes.ts': `import { Route } from '@angular/router';

export const appRoutes: Route[] = [];
`,
    'apps/docs/src/app/app.ts': `import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}
`,
    'apps/docs/src/app/app.html': '<router-outlet></router-outlet>\n',
    'angular.json': JSON.stringify({
      version: 1,
      projects: { [name]: { root: 'apps/docs', ...rest, architect } },
    }),
  };
}

/**
 * A tree over the files, which exist outside it.
 * @param files - The files by workspace-relative path.
 */
function hostTree(files: Record<string, string>): UnitTestTree {
  return new UnitTestTree(
    new HostTree(
      new virtualFs.test.TestHost(
        Object.fromEntries(Object.entries(files).map(([file, content]) => [`/${file}`, content])),
      ),
    ),
  );
}

/**
 * Every file of a tree with its content.
 * @param tree - The tree.
 */
function snapshot(tree: UnitTestTree): Record<string, string> {
  return Object.fromEntries(tree.files.map((file: string) => [file, tree.readContent(file)]));
}

interface Target {
  builder: string;
  options: Record<string, unknown>;
}

/**
 * The targets of the application in the virtual angular.json, which Nx writes to its project.json.
 * @param tree - The tree after the schematic ran.
 */
function architect(tree: UnitTestTree): Record<string, Target> {
  return JSON.parse(tree.readContent('angular.json')).projects.docs.architect;
}

describe('ng-add in an Nx workspace', () => {
  let runner: SchematicTestRunner;
  let logs: logging.LogEntry[];

  const logged = (level?: string): string =>
    logs
      .filter((entry: logging.LogEntry) => !level || entry.level === level)
      .map((entry: logging.LogEntry) => entry.message)
      .join('\n');
  const setup = (tree: UnitTestTree, options: Partial<Schema> = {}): Promise<UnitTestTree> =>
    runner.runSchematic('ng-add-setup-project', { project: 'docs', ...options }, tree);

  beforeEach(() => {
    runner = createRunner();
    logs = [];
    runner.logger.subscribe((entry: logging.LogEntry) => logs.push(entry));
  });

  it("sets up the Vite engine on Nx's application and dev-server executors", async () => {
    const files: Record<string, string> = nxWorkspace(PROJECT);
    const tree: UnitTestTree = await setup(hostTree(files));
    const targets: Record<string, Target> = architect(tree);

    expect(logged()).toContain('[INFO]: Engine: Vite (@ng-doc/builder:vite-application)');
    expect(targets['build'].builder).toBe('@ng-doc/builder:vite-application');
    expect(targets['build'].options).toEqual({
      configFile: 'apps/docs/vite.config.mjs',
      outputPath: 'dist/apps/docs',
    });
    expect(targets['serve'].builder).toBe('@ng-doc/builder:vite-dev-server');
    expect(targets['serve'].options).toEqual({ configFile: 'apps/docs/vite.config.mjs' });
    // The Nx executor keeps the Angular build options, with the NgDoc styles and assets.
    expect(targets['build-angular'].builder).toBe('@nx/angular:application');
    expect(targets['build-angular'].options['styles']).toEqual([
      ...NG_DOC_STYLES,
      'apps/docs/src/styles.scss',
    ]);
    expect(targets['serve-static']).toEqual(architect(hostTree(files))['serve-static']);

    // Every edit goes through the virtual angular.json: an edit of project.json in the same tree
    // would be overwritten by it when Nx commits the tree.
    expect(tree.readContent('apps/docs/project.json')).toBe(files['apps/docs/project.json']);

    const config: string = tree.readContent('apps/docs/vite.config.mjs');

    expect(config).toContain("browser: 'apps/docs/src/main.ts'");
    expect(config).toContain("'node_modules/@ng-doc/app/styles/global.css'");
    expect(config).toContain("input: 'node_modules/@ng-doc/ui-kit/assets'");
    expect(config).toContain("inlineStylesExtension: 'scss'");
    expect(tree.readContent('.gitignore')).toContain('/.cache/ng-doc');
  });

  it('reports the Nx options the Vite engine cannot honour', async () => {
    const project: Project = structuredClone(PROJECT);

    Object.assign(project.targets.build.options, {
      buildLibsFromSource: false,
      plugins: ['tools/esbuild/env.js'],
      indexHtmlTransformer: 'tools/index-html.ts',
    });
    project.targets.serve.options = { esbuildMiddleware: ['tools/middleware.js'] };

    const tree: UnitTestTree = await setup(hostTree(nxWorkspace(project)));
    const warnings: string = logged('warn');

    expect(architect(tree)['build'].builder).toBe('@ng-doc/builder:vite-application');
    expect(warnings).toContain('`build.buildLibsFromSource`: is `false`');
    expect(warnings).toContain('`build.plugins`: Nx runs these esbuild plugins');
    expect(warnings).toContain('`build.indexHtmlTransformer`: Nx transforms index.html');
    expect(warnings).toContain('`serve.esbuildMiddleware`');
  });

  it('changes nothing on a second run', async () => {
    const first: UnitTestTree = await setup(hostTree(nxWorkspace(PROJECT)));
    const before: Record<string, string> = snapshot(first);
    const second: UnitTestTree = await setup(first);

    expect(snapshot(second)).toEqual(before);
    expect(logged('info')).toContain('already builds with the Vite engine');
  });

  it('sets up the legacy builders with --engine legacy', async () => {
    const tree: UnitTestTree = await setup(hostTree(nxWorkspace(PROJECT)), { engine: 'legacy' });
    const targets: Record<string, Target> = architect(tree);

    expect(targets['build'].builder).toBe('@ng-doc/builder:application');
    expect(targets['serve'].builder).toBe('@ng-doc/builder:dev-server');
    expect(targets['build-angular']).toBeUndefined();
    expect(tree.exists('apps/docs/vite.config.mjs')).toBe(false);
  });

  it("keeps the legacy builders for Nx's browser-esbuild executor", async () => {
    const project: Project = structuredClone(PROJECT);

    project.targets.build.executor = '@nx/angular:browser-esbuild';

    const tree: UnitTestTree = await setup(hostTree(nxWorkspace(project)));

    expect(architect(tree)['build'].builder).toBe('@ng-doc/builder:application');
    expect(tree.exists('apps/docs/vite.config.mjs')).toBe(false);
    expect(logged('info')).toContain('"build" target uses "@nx/angular:browser-esbuild"');
  });
});
