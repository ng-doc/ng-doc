import { virtualFs } from '@angular-devkit/core';
import { HostTree, Tree } from '@angular-devkit/schematics';
import { UnitTestTree } from '@angular-devkit/schematics/testing';

/** The files of a workspace, by workspace-relative path. */
export type Files = Record<string, string>;

export function treeOf(files: Files): UnitTestTree {
  const tree = new UnitTestTree(new HostTree());
  for (const [file, content] of Object.entries(files)) tree.create(file, content);
  return tree;
}

/**
 * A tree over files that exist outside it, as a workspace on disk does under `ng` or `nx g`:
 * unlike in `treeOf`, writing one of them is an overwrite.
 * @param files - The files by workspace-relative path.
 */
export function hostTreeOf(files: Files): UnitTestTree {
  const host = new virtualFs.test.TestHost(
    Object.fromEntries(Object.entries(files).map(([file, content]) => [`/${file}`, content])),
  );
  return new UnitTestTree(new HostTree(host));
}

/**
 * The files with the `angular.json` that `nx g` shows Angular devkit schematics: every
 * `project.json` as a project, its targets under `architect` with `builder` keys.
 * @param files - The files by workspace-relative path.
 */
export function withNxAngularJson(files: Files): Files {
  const projects = Object.fromEntries(
    Object.entries(files)
      .filter(([file]) => file.endsWith('/project.json'))
      .map(([file, content]) => {
        const { name, targets, ...project } = JSON.parse(content);
        const architect = Object.fromEntries(
          Object.entries(targets as Record<string, Record<string, unknown>>).map(
            ([target, { executor, ...rest }]) => [target, { builder: executor, ...rest }],
          ),
        );
        return [name, { root: file.replace(/\/project\.json$/, ''), ...project, architect }];
      }),
  );
  return { ...files, 'angular.json': JSON.stringify({ version: 1, projects }) };
}

/** Every file of a tree with its content, for whole-tree comparisons. */
export function snapshot(tree: Tree): Files {
  const files: Files = {};
  tree.visit((file) => {
    files[file.replace(/^\//, '')] = tree.readText(file);
  });
  return Object.fromEntries(
    Object.entries(files).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const NG_DOC_ASSETS = (project: string) => [
  { glob: '**/*', input: 'node_modules/@ng-doc/app/assets', output: 'assets/ng-doc/app' },
  { glob: '**/*', input: 'node_modules/@ng-doc/ui-kit/assets', output: 'assets/ng-doc/ui-kit' },
  { glob: '**/*', input: `ng-doc/${project}/assets`, output: 'assets/ng-doc' },
];

/**
 * A standalone, zoneless Angular 22 application with SSR, as `ng new --ssr` creates it, after
 * the NgDoc `ng add` schematic switched it to the legacy NgDoc builders.
 */
export function standaloneApp(): Files {
  return {
    'package.json': json({
      name: 'site',
      private: true,
      dependencies: {
        '@angular/common': '^22.0.0',
        '@angular/compiler': '^22.0.0',
        '@angular/core': '^22.0.0',
        '@angular/platform-server': '^22.0.0',
        '@angular/ssr': '^22.0.6',
        '@ng-doc/app': '22.0.0',
        '@ng-doc/builder': '22.0.0',
        '@ng-doc/core': '22.0.0',
        '@ng-doc/ui-kit': '22.0.0',
      },
      devDependencies: { '@angular/build': '^22.0.6', '@angular/compiler-cli': '^22.0.0' },
    }),
    'angular.json': json({
      version: 1,
      projects: {
        site: {
          projectType: 'application',
          root: '',
          sourceRoot: 'src',
          architect: {
            build: {
              builder: '@ng-doc/builder:application',
              options: {
                browser: 'src/main.ts',
                tsConfig: 'tsconfig.app.json',
                inlineStyleLanguage: 'scss',
                assets: [...NG_DOC_ASSETS('site'), { glob: '**/*', input: 'public' }],
                styles: ['node_modules/@ng-doc/app/styles/global.css', 'src/styles.scss'],
                server: 'src/main.server.ts',
                outputMode: 'server',
                security: { allowedHosts: [] },
                ssr: { entry: 'src/server.ts' },
              },
              configurations: {
                production: {
                  budgets: [{ type: 'initial', maximumWarning: '500kB', maximumError: '1MB' }],
                  outputHashing: 'all',
                },
                development: { optimization: false, extractLicenses: false, sourceMap: true },
              },
              defaultConfiguration: 'production',
            },
            serve: {
              builder: '@ng-doc/builder:dev-server',
              configurations: {
                production: { buildTarget: 'site:build:production' },
                development: { buildTarget: 'site:build:development' },
              },
              defaultConfiguration: 'development',
            },
            test: { builder: '@angular/build:unit-test' },
          },
        },
      },
    }),
    'tsconfig.json': json({
      compilerOptions: {
        strict: true,
        module: 'preserve',
        paths: {
          '@ng-doc/generated': ['./ng-doc/site/index.ts'],
          '@ng-doc/generated/*': ['./ng-doc/site/*'],
        },
      },
      files: [],
      references: [{ path: './tsconfig.app.json' }],
    }),
    'tsconfig.app.json': json({
      extends: './tsconfig.json',
      compilerOptions: { types: ['node'] },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
    }),
    '.gitignore': '/dist\n/node_modules\n\n# NgDoc files\n/ng-doc\n',
    'ng-doc.config.ts':
      "import { NgDocConfiguration } from '@ng-doc/builder';\n\nconst config: NgDocConfiguration = {};\n\nexport default config;\n",
    'src/index.html':
      '<!doctype html>\n<html lang="en">\n<head>\n  <base href="/">\n</head>\n<body>\n  <app-root></app-root>\n</body>\n</html>\n',
    'src/styles.scss': '',
    'src/main.ts':
      "import { bootstrapApplication } from '@angular/platform-browser';\nimport { appConfig } from './app/app.config';\nimport { App } from './app/app';\n\nbootstrapApplication(App, appConfig)\n  .catch((err) => console.error(err));\n",
    'src/main.server.ts':
      "import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';\nimport { App } from './app/app';\nimport { config } from './app/app.config.server';\n\nconst bootstrap = (context: BootstrapContext) =>\n    bootstrapApplication(App, config, context);\n\nexport default bootstrap;\n",
    'src/server.ts': "import express from 'express';\n\nexport const app = express();\n",
    'src/app/app.ts':
      "import { Component } from '@angular/core';\n\n@Component({ selector: 'app-root', template: '' })\nexport class App {}\n",
    'src/app/app.config.ts': 'export const appConfig = { providers: [] };\n',
    'src/app/app.config.server.ts': 'export const config = { providers: [] };\n',
    'public/favicon.ico': '',
    'ng-doc/site/index.ts': 'export const legacy = true;\n',
    'ng-doc/site/guides/intro/page.ts': 'export default {};\n',
  };
}

/** An NgModule application with Zone.js and no server rendering, on the legacy builders. */
export function ngModuleApp(): Files {
  return {
    'package.json': json({ name: 'modules', private: true, dependencies: {} }),
    'angular.json': json({
      version: 1,
      projects: {
        docs: {
          projectType: 'application',
          root: 'projects/docs',
          sourceRoot: 'projects/docs/src',
          architect: {
            build: {
              builder: '@ng-doc/builder:application',
              options: {
                outputPath: 'dist/docs',
                index: 'projects/docs/src/index.html',
                browser: 'projects/docs/src/main.ts',
                polyfills: ['zone.js'],
                tsConfig: 'projects/docs/tsconfig.app.json',
                assets: ['projects/docs/src/favicon.ico', ...NG_DOC_ASSETS('docs')],
                styles: ['projects/docs/src/styles.css'],
                scripts: [],
              },
            },
            serve: {
              builder: '@ng-doc/builder:dev-server',
              options: { buildTarget: 'docs:build', port: 4300 },
            },
          },
        },
      },
    }),
    'projects/docs/tsconfig.app.json': json({
      compilerOptions: { paths: { '@ng-doc/generated': ['./ng-doc/docs/index.ts'] } },
      files: ['src/main.ts'],
    }),
    'projects/docs/src/index.html': '<html><head><base href="/"></head><body></body></html>\n',
    'projects/docs/src/main.ts':
      "import { platformBrowser } from '@angular/platform-browser';\nimport { AppModule } from './app/app.module';\n\nplatformBrowser().bootstrapModule(AppModule);\n",
    'projects/docs/src/app/app.module.ts':
      "import { NgModule } from '@angular/core';\nimport { AppComponent } from './app.component';\n\n@NgModule({ declarations: [AppComponent], bootstrap: [AppComponent] })\nexport class AppModule {}\n",
    'projects/docs/src/app/app.component.ts':
      "import { Component } from '@angular/core';\n\n@Component({ selector: 'app-root', template: '', standalone: false })\nexport class AppComponent {}\n",
    'projects/docs/src/ng-doc.config.ts': 'export default {};\n',
  };
}

/** A standalone application whose build target sets most of the options the migration handles. */
export function customOptionsApp(): Files {
  const files = standaloneApp();
  const workspace = JSON.parse(files['angular.json']);
  const build = workspace.projects.site.architect.build;
  build.options = {
    ...build.options,
    outputPath: { base: 'dist/site', browser: '' },
    outputMode: 'static',
    prerender: { routesFile: 'routes.txt', discoverRoutes: false },
    baseHref: '/docs/',
    deployUrl: 'https://cdn.example.com/',
    stylePreprocessorOptions: {
      includePaths: ['src/styles'],
      sass: { silenceDeprecations: ['import'] },
    },
    externalDependencies: ['canvas'],
    scripts: ['src/legacy.js'],
    allowedCommonJsDependencies: ['lodash'],
    ngDoc: { config: 'docs/ng-doc.config.ts', tags: ['public'] },
    webWorkerTsConfig: 'tsconfig.worker.json',
    unknownOption: true,
  };
  delete build.options.ssr;
  delete build.options.security;
  build.configurations.production = {
    ...build.configurations.production,
    tsConfig: 'tsconfig.prod.json',
    fileReplacements: [
      { replace: 'src/environments/environment.ts', with: 'src/environments/environment.prod.ts' },
    ],
    sourceMap: { scripts: true, hidden: true },
    define: { BUILD_KIND: "'production'" },
  };
  const serve = workspace.projects.site.architect.serve;
  serve.options = {
    port: 4400,
    host: '0.0.0.0',
    proxyConfig: 'proxy.conf.json',
    headers: { 'X-Docs': 'yes' },
    hmr: false,
  };
  workspace.projects.site.architect['extract-i18n'] = { builder: '@angular/build:extract-i18n' };
  files['angular.json'] = json(workspace);
  files['routes.txt'] = '/\n/guides/one\n\n/guides/two\n';
  files['docs/ng-doc.config.ts'] = "export default { outDir: 'generated' };\n";
  files['tsconfig.prod.json'] = json({ extends: './tsconfig.app.json' });
  files['generated/ng-doc/site/index.ts'] = 'export const legacy = true;\n';
  return files;
}

/** An Nx workspace: the project lives in `apps/docs/project.json` and uses `executor`. */
export function nxApp(): Files {
  return {
    'package.json': json({ name: 'nx-docs', private: true, devDependencies: { vite: '^8.3.2' } }),
    'nx.json': json({ targetDefaults: {} }),
    'apps/docs/project.json': json({
      name: 'docs',
      projectType: 'application',
      sourceRoot: 'apps/docs/src',
      targets: {
        build: {
          executor: '@ng-doc/builder:application',
          outputs: ['{options.outputPath}'],
          options: {
            outputPath: 'dist/apps/docs',
            browser: 'apps/docs/src/main.ts',
            polyfills: ['zone.js'],
            tsConfig: 'apps/docs/tsconfig.app.json',
            assets: ['apps/docs/src/assets', ...NG_DOC_ASSETS('docs')],
            styles: ['apps/docs/src/styles.scss'],
            inlineStyleLanguage: 'scss',
          },
          configurations: {
            production: {
              fileReplacements: [
                {
                  replace: 'apps/docs/src/environments/environment.ts',
                  with: 'apps/docs/src/environments/environment.prod.ts',
                },
              ],
            },
            development: { optimization: false },
          },
          defaultConfiguration: 'production',
        },
        serve: {
          executor: '@ng-doc/builder:dev-server',
          continuous: true,
          configurations: {
            production: { buildTarget: 'docs:build:production' },
            development: { buildTarget: 'docs:build:development' },
          },
          defaultConfiguration: 'development',
        },
        lint: { executor: '@nx/eslint:lint' },
      },
    }),
    'apps/docs/tsconfig.app.json': json({
      compilerOptions: { paths: { '@ng-doc/generated': ['../../ng-doc/docs/index.ts'] } },
    }),
    'apps/docs/src/index.html': '<html><head><base href="/"></head><body></body></html>\n',
    'apps/docs/src/main.ts':
      "import { bootstrapApplication } from '@angular/platform-browser';\nimport { AppComponent } from './app/app.component';\n\nbootstrapApplication(AppComponent);\n",
    'apps/docs/src/app/app.component.ts': 'export class AppComponent {}\n',
    'apps/docs/src/assets/logo.svg': '<svg/>\n',
  };
}
