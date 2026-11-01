import { logging } from '@angular-devkit/core';
import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import { APP_COMPONENT_CONTENT } from '../constants/app-component-content';
import { Schema } from '../schema';
import { isPlaceholderTemplate } from '../utils/layout-template';
import { createRunner } from './ng-add-runner';

const OPTIONS: Schema = { project: '' };

/** The template `ng new` writes for the root component (Angular's own file, unrendered). */
const NG_NEW_TEMPLATE: string = readFileSync(
  join(
    dirname(require.resolve('@schematics/angular/package.json')),
    'application/files/common-files/src/app/app__suffix__.html.template',
  ),
  'utf-8',
);

/** The template of an application that already has pages of its own. */
const APP_TEMPLATE: string = `<app-header />
<main class="content">
  <router-outlet />
</main>
<app-footer />
`;

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

/**
 * The root component of an Angular 22 application.
 * @param template - The `templateUrl` or `template` property of its metadata.
 */
function appComponent(template: string = `templateUrl: './app.html'`): string {
  return `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  ${template},
})
export class App {}
`;
}

describe('ng-add layout', () => {
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
    host.create(
      'tsconfig.app.json',
      '{\n  "extends": "./tsconfig.json",\n  "include": ["src/**/*.ts"]\n}',
    );
    host.create('.gitignore', '/node_modules');
    host.create(
      'src/main.ts',
      `import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
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
    host.create(
      'src/app/app.routes.ts',
      `import { Routes } from '@angular/router';\n\nexport const routes: Routes = [];\n`,
    );
    host.create('src/app/app.ts', appComponent());
  });

  /** The warnings that the run logged. */
  function warnings(): string[] {
    return messages
      .filter((entry: logging.LogEntry) => entry.level === 'warn')
      .map((entry: logging.LogEntry) => entry.message);
  }

  it.each([
    ['the ng new placeholder', NG_NEW_TEMPLATE],
    ['an empty template', '\n'],
    [
      'a template with only a router outlet',
      '<!-- The shell -->\n<router-outlet></router-outlet>\n',
    ],
  ])('replaces %s with the layout', async (_name: string, template: string) => {
    host.create('src/app/app.html', template);

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(tree.readContent('src/app/app.html')).toEqual(APP_COMPONENT_CONTENT);
    expect(tree.readContent('src/app/app.ts')).toContain(
      'imports: [RouterOutlet, NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent]',
    );
    expect(warnings()).toEqual([]);
  });

  it("keeps the template of an existing application and doesn't import the layout", async () => {
    host.create('src/app/app.html', APP_TEMPLATE);

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(tree.readContent('src/app/app.html')).toEqual(APP_TEMPLATE);
    expect(tree.readContent('src/app/app.ts')).toEqual(appComponent());
    // The providers are still added.
    expect(tree.readContent('src/app/app.config.ts')).toContain('provideNgDocApp()');
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('was left as it is');
    expect(warnings()[0]).toContain('https://ng-doc.com/docs/customize/lazy-route');
    expect(warnings()[0]).toContain(APP_COMPONENT_CONTENT);
  });

  it('keeps an inline template', async () => {
    const inline: string = appComponent('template: `<h1>My app</h1><router-outlet />`');

    host.overwrite('src/app/app.ts', inline);
    // A stray file next to the component is not its template.
    host.create('src/app/app.component.html', '<router-outlet />');

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(tree.readContent('src/app/app.ts')).toEqual(inline);
    expect(tree.readContent('src/app/app.component.html')).toEqual('<router-outlet />');
    expect(warnings()).toHaveLength(1);
  });

  it('leaves a template that already renders the layout as it is', async () => {
    const template: string = `<ng-doc-root>\n  <app-navbar ngDocCustomNavbar />\n  <router-outlet />\n</ng-doc-root>\n`;

    host.create('src/app/app.html', template);

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(tree.readContent('src/app/app.html')).toEqual(template);
    expect(tree.readContent('src/app/app.ts')).toContain('NgDocRootComponent');
    expect(warnings()).toEqual([]);
  });
});

describe('isPlaceholderTemplate', () => {
  it.each([
    ['the ng new placeholder', NG_NEW_TEMPLATE, true],
    ['an empty template', '', true],
    ['a self-closing router outlet', '  <router-outlet />  ', true],
    ['a router outlet', '<router-outlet></router-outlet>', true],
    ['only a comment', '<!-- Nothing yet -->', true],
    ['a heading and an outlet', '<h1>Title</h1>\n<router-outlet />', false],
    ['a named outlet', '<router-outlet name="aside" />', false],
    ['a shell component', '<app-shell />', false],
  ])('%s', (_name: string, template: string, expected: boolean) => {
    expect(isPlaceholderTemplate(template)).toBe(expected);
  });
});
