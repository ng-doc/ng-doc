import { logging } from '@angular-devkit/core';
import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { ArrayLiteralExpression } from 'ng-morph';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_COMPONENT_CONTENT } from '../constants/app-component-content';
import { Schema } from '../schema';
import { createRunner } from './ng-add-runner';

// SchematicTestRunner requires the schematic through Node, so the spec requires the module too: a
// spy on this module object sees the schematic's calls.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const arrayEntry = require('../utils/add-array-entry') as typeof import('../utils/add-array-entry');

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
            "tsConfig": "tsconfig.app.json"
          }
        }
      }
    }
  }
}`;

const STANDALONE_MAIN: string = `import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig);
`;

const MODULE_MAIN: string = `import { platformBrowser } from '@angular/platform-browser';
import { AppModule } from './app/app-module';

platformBrowser().bootstrapModule(AppModule);
`;

describe('ng-add edge cases', () => {
  let host: UnitTestTree;
  let runner: SchematicTestRunner;
  let messages: logging.LogEntry[];

  beforeEach(() => {
    host = new UnitTestTree(new HostTree());
    runner = createRunner();
    messages = [];
    runner.logger.subscribe((entry: logging.LogEntry) => messages.push(entry));

    host.create('package.json', '{"dependencies": {"@angular/core": "^22.0.0"}}');
    host.create('angular.json', ANGULAR_JSON);
    host.create('tsconfig.json', '{\n  "compilerOptions": {}\n}');
    host.create('tsconfig.app.json', '{\n  "extends": "./tsconfig.json"\n}');
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

  afterEach(() => vi.restoreAllMocks());

  /**
   * Returns the logged messages of a level.
   * @param level - The log level.
   */
  function logged(level: logging.LogLevel): string[] {
    return messages
      .filter((entry: logging.LogEntry) => entry.level === level)
      .map((entry: logging.LogEntry) => entry.message);
  }

  /**
   * Creates an NgModule application whose root module is `module`.
   * @param module - Content of `src/app/app-module.ts`.
   */
  function createModuleApp(module: string): void {
    host.create('src/main.ts', MODULE_MAIN);
    host.create('src/app/app-module.ts', module);
    host.overwrite(
      'src/app/app.ts',
      `import { Component } from '@angular/core';

@Component({selector: 'app-root', templateUrl: './app.html', standalone: false})
export class App {}
`,
    );
  }

  it('should write nothing when the step fails halfway, and still run the next steps', async () => {
    const config = `import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes)]
};
`;

    host.create('src/main.ts', STANDALONE_MAIN);
    host.create('src/app/app.config.ts', config);
    vi.spyOn(arrayEntry, 'addArrayEntries').mockImplementation((array: ArrayLiteralExpression) => {
      array.addElement('halfFinished()');

      throw new Error('boom');
    });

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(tree.readContent('src/app/app.config.ts')).toEqual(config);
    expect(logged('error').join('\n')).toContain('boom');
    // The layout step runs on a project of its own and does not flush the failed edits.
    expect(tree.readContent('src/app/app.html')).toEqual(APP_COMPONENT_CONTENT);
  });

  it('should add a separate import next to a namespace import of the same module', async () => {
    host.create('src/main.ts', STANDALONE_MAIN);
    host.create(
      'src/app/app.config.ts',
      `import { ApplicationConfig } from '@angular/core';
import * as router from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [router.provideRouter(routes, router.withComponentInputBinding())]
};
`,
    );

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const config: string = tree.readContent('src/app/app.config.ts');

    expect(config).toContain("import * as router from '@angular/router';");
    // A separate declaration: `import * as router, { ... }` is not valid.
    expect(config).toContain(
      'import { provideRouter, withInMemoryScrolling } from "@angular/router";',
    );
    expect(config).toContain(
      'router.provideRouter([...routes, ...NG_DOC_ROUTING], router.withComponentInputBinding(), withInMemoryScrolling(',
    );
    expect(config.match(/provideRouter\(/g)).toHaveLength(1);
    expect(logged('error')).toEqual([]);
  });

  it('should put the NgDoc routes before a wildcard route of inline routes', async () => {
    host.create('src/main.ts', STANDALONE_MAIN);
    host.create(
      'src/app/app.config.ts',
      `import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter([{path: 'home', children: []}, {path: '**', redirectTo: 'home'}])]
};
`,
    );

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(tree.readContent('src/app/app.config.ts')).toContain(
      "provideRouter([{path: 'home', children: []}, ...NG_DOC_ROUTING, {path: '**', redirectTo: 'home'}], withInMemoryScrolling(",
    );
  });

  it('should warn when routes in a variable end with a wildcard route', async () => {
    host.create('src/main.ts', STANDALONE_MAIN);
    host.overwrite(
      'src/app/app.routes.ts',
      `import { Routes } from '@angular/router';

export const routes: Routes = [{path: '**', redirectTo: ''}];
`,
    );
    host.create(
      'src/app/app.config.ts',
      `import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes)]
};
`,
    );

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(tree.readContent('src/app/app.config.ts')).toContain(
      'provideRouter([...routes, ...NG_DOC_ROUTING]',
    );
    expect(logged('warn').join('\n')).toContain('"routes" has a wildcard ("**") route');
  });

  it('should warn instead of editing forRoot options held in a variable', async () => {
    createModuleApp(`import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { App } from './app';

const options = { useHash: true };

@NgModule({declarations: [App], imports: [RouterModule.forRoot([], options)], bootstrap: [App]})
export class AppModule {}
`);

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const module: string = tree.readContent('src/app/app-module.ts');

    expect(module).toContain('RouterModule.forRoot([...NG_DOC_ROUTING], options)');
    expect(module.match(/forRoot\(/g)).toHaveLength(1);
    expect(logged('warn').join('\n')).toContain(
      'The options of "RouterModule.forRoot" ("options") are not an object literal',
    );
  });

  it('should keep one-line forRoot options on one line', async () => {
    createModuleApp(`import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { App } from './app';

@NgModule({declarations: [App], imports: [RouterModule.forRoot([], { scrollPositionRestoration: 'top' })], bootstrap: [App]})
export class AppModule {}
`);

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(tree.readContent('src/app/app-module.ts')).toContain(
      "imports: [RouterModule.forRoot([...NG_DOC_ROUTING], { scrollPositionRestoration: 'top', anchorScrolling: 'enabled', scrollOffset: [0, 70] }), NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent]",
    );
  });

  it('should extend a forRoot call held in a variable that the root module imports', async () => {
    createModuleApp(`import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { App } from './app';

const routing = RouterModule.forRoot([]);

@NgModule({declarations: [App], imports: [routing], bootstrap: [App]})
export class AppModule {}
`);

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const module: string = tree.readContent('src/app/app-module.ts');

    expect(module).toContain(
      "const routing = RouterModule.forRoot([...NG_DOC_ROUTING], {scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled', scrollOffset: [0, 70]});",
    );
    expect(module.match(/forRoot\(/g)).toHaveLength(1);
  });

  it('should not add a second forRoot when a routing module cannot be inspected', async () => {
    createModuleApp(`import { NgModule } from '@angular/core';
import { AppRoutingModule } from './app-routing-module';
import { App } from './app';

@NgModule({declarations: [App], imports: [AppRoutingModule], bootstrap: [App]})
export class AppModule {}
`);
    host.create(
      'src/app/app-routing-module.ts',
      `import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

const ROUTING_IMPORTS = [RouterModule.forRoot([])];

@NgModule({imports: ROUTING_IMPORTS, exports: [RouterModule]})
export class AppRoutingModule {}
`,
    );

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const module: string = tree.readContent('src/app/app-module.ts');

    expect(module).not.toContain('forRoot');
    expect(module).toContain('provideNgDocApp()');
    expect(logged('warn').join('\n')).toContain(
      'Could not check whether "AppRoutingModule" calls "RouterModule.forRoot"',
    );
  });

  it('should say that module providers in a variable are not an array literal', async () => {
    createModuleApp(`import { NgModule } from '@angular/core';
import { App } from './app';

const PROVIDERS = [];

@NgModule({declarations: [App], imports: [], providers: PROVIDERS, bootstrap: [App]})
export class AppModule {}
`);

    await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(logged('error').join('\n')).toContain(
      'The "providers" of "AppModule" are not an array literal',
    );
    expect(logged('error').join('\n')).not.toContain('Could not find the root module');
  });
});
