import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Schema } from '../schema';
import { createRunner } from './ng-add-runner';

const OPTIONS: Schema = { project: '' };

const ANGULAR_JSON: string = `{
  "version": 1,
  "projects": {
    "docs": {
      "projectType": "application",
      "root": "",
      "sourceRoot": "src",
      "architect": {
        "build": {
          "builder": "@angular/build:application",
          "options": {
            "browser": "src/main.ts",
            "tsConfig": "tsconfig.app.json",
            "assets": [{ "glob": "**/*", "input": "public" }],
            "styles": ["src/styles.css"]
          }
        },
        "serve": {
          "builder": "@angular/build:dev-server"
        }
      }
    }
  }
}`;

describe('ng-add run twice', () => {
  let host: UnitTestTree;
  let runner: SchematicTestRunner;

  beforeEach(() => {
    host = new UnitTestTree(new HostTree());
    runner = createRunner();

    host.create('package.json', '{"dependencies": {"@angular/core": "^22.0.0"}}');
    host.create('angular.json', ANGULAR_JSON);
    host.create('tsconfig.json', '{\n  "compilerOptions": {}\n}');
    host.create(
      'tsconfig.app.json',
      '{\n  "extends": "./tsconfig.json",\n  "include": ["src/**/*.ts"]\n}',
    );
    host.create('.gitignore', '/node_modules');
    host.create('src/app/app.html', '<router-outlet />');
  });

  it('should leave a standalone app unchanged on the second run', async () => {
    host.create(
      'src/main.ts',
      `import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
`,
    );
    host.create(
      'src/app/app.config.ts',
      `import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes)
  ]
};
`,
    );
    host.create(
      'src/app/app.ts',
      `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html'
})
export class App {}
`,
    );

    const first: Record<string, string> = await runTwice(
      runner,
      host,
      async (tree: UnitTestTree) => {
        const config: string = tree.readContent('src/app/app.config.ts');

        expect(config.match(/provideRouter\(/g)).toHaveLength(1);
        expect(config.match(/provideHttpClient\(/g)).toHaveLength(1);
        expect(config.match(/withInMemoryScrolling\(/g)).toHaveLength(1);
        expect(config.match(/provideNgDocApp\(/g)).toHaveLength(1);
        expect(config.match(/\.\.\.NG_DOC_ROUTING/g)).toHaveLength(1);
        expect(tree.readContent('src/app/app.ts').match(/NgDocRootComponent/g)).toHaveLength(2);
      },
    );

    expect(first['src/app/app.config.ts']).toContain('provideNgDocContext()');
  });

  it('should leave an Angular 22 NgModule app unchanged on the second run', async () => {
    // The files `ng new --no-standalone --routing --zoneless=false` creates with Angular 22.
    host.create(
      'src/main.ts',
      `import { platformBrowser } from '@angular/platform-browser';
import { AppModule } from './app/app-module';

platformBrowser().bootstrapModule(AppModule, {
  
})
  .catch(err => console.error(err));
`,
    );
    host.create(
      'src/app/app-module.ts',
      `import { NgModule, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';

@NgModule({
  declarations: [
    App
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
  ],
  bootstrap: [App]
})
export class AppModule { }
`,
    );
    host.create(
      'src/app/app-routing-module.ts',
      `import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
`,
    );
    host.create(
      'src/app/app.ts',
      `import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('docs');
}
`,
    );

    await runTwice(runner, host, async (tree: UnitTestTree) => {
      const module: string = tree.readContent('src/app/app-module.ts');
      const routing: string = tree.readContent('src/app/app-routing-module.ts');

      expect(module).not.toContain('RouterModule');
      expect(routing.match(/RouterModule\.forRoot\(/g)).toHaveLength(1);
      expect(routing).toContain('RouterModule.forRoot([...routes, ...NG_DOC_ROUTING], {');
      expect(module.match(/provideHttpClient\(/g)).toHaveLength(1);
      expect(module.match(/provideNgDocApp\(/g)).toHaveLength(1);
      expect(module.match(/provideZoneChangeDetection\(/g)).toHaveLength(1);
      expect(module.match(/NgDocRootComponent/g)).toHaveLength(2);
      expect(tree.readContent('src/app/app.html')).toContain('<ng-doc-root>');
    });
  });

  it('should merge the duplicate providers that the previous ng add left and then stay unchanged', async () => {
    // What `ng add` produced before it matched existing calls: a second `provideRouter` and a
    // second `provideHttpClient` with the deprecated `withFetch()`.
    host.create(
      'src/main.ts',
      `import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
`,
    );
    host.create(
      'src/app/app.config.ts',
      `import { provideNgDocApp, provideSearchEngine, NgDocDefaultSearchEngine, providePageSkeleton, NG_DOC_DEFAULT_PAGE_SKELETON, provideMainPageProcessor, NG_DOC_DEFAULT_PAGE_PROCESSORS } from "@ng-doc/app";
import { NG_DOC_ROUTING, provideNgDocContext } from "@ng-doc/generated";
import { provideHttpClient, withInterceptorsFromDi, withFetch } from "@angular/common/http";
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideHttpClient(withInterceptorsFromDi()), provideRouter(NG_DOC_ROUTING, withInMemoryScrolling({scrollPositionRestoration: "enabled", anchorScrolling: "enabled"})), provideHttpClient(withInterceptorsFromDi(), withFetch()), provideNgDocContext(), provideNgDocApp(), provideSearchEngine(NgDocDefaultSearchEngine), providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON), provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS)]
};
`,
    );
    host.create(
      'src/app/app.ts',
      `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent } from "@ng-doc/app";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent],
  templateUrl: './app.html'
})
export class App {}
`,
    );

    const first: Record<string, string> = await runTwice(runner, host, async () => undefined);

    expect(first['src/app/app.config.ts'])
      .toEqual(`import { provideNgDocApp, provideSearchEngine, NgDocDefaultSearchEngine, providePageSkeleton, NG_DOC_DEFAULT_PAGE_SKELETON, provideMainPageProcessor, NG_DOC_DEFAULT_PAGE_PROCESSORS } from "@ng-doc/app";
import { NG_DOC_ROUTING, provideNgDocContext } from "@ng-doc/generated";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter([...routes, ...NG_DOC_ROUTING], withInMemoryScrolling({scrollPositionRestoration: "enabled", anchorScrolling: "enabled"})), provideHttpClient(withInterceptorsFromDi()), provideNgDocContext(), provideNgDocApp(), provideSearchEngine(NgDocDefaultSearchEngine), providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON), provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS)]
};
`);
  });
});

/**
 * Runs the setup schematic twice, checks the first result and that the second run changes no file.
 * @param runner - The schematic runner.
 * @param host - The application tree.
 * @param check - Assertions on the tree after each run.
 * @returns The file contents after the first run.
 */
async function runTwice(
  runner: SchematicTestRunner,
  host: UnitTestTree,
  check: (tree: UnitTestTree) => Promise<void>,
): Promise<Record<string, string>> {
  const first: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
  const firstFiles: Record<string, string> = readFiles(first);

  await check(first);

  const second: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, first);

  await check(second);
  expect(readFiles(second)).toEqual(firstFiles);

  return firstFiles;
}

/**
 * Reads every file of a tree.
 * @param tree - The tree to read.
 */
function readFiles(tree: UnitTestTree): Record<string, string> {
  return Object.fromEntries(
    tree.files.map((file: string) => [file.replace(/^\//, ''), tree.readContent(file)]),
  );
}
