import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { APP_COMPONENT_CONTENT } from '../constants/app-component-content';
import { Schema } from '../schema';
import { createRunner } from './ng-add-runner';

const OPTIONS: Schema = { project: '' };

/*
 * The files `ng new` creates with Angular 22: the application is zoneless (no change-detection
 * provider and no `zone.js` polyfill), the root component is `App` in `app.ts`, and the build
 * uses the `browser` option.
 */
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

const APP_CONFIG: string = `import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes)
  ]
};
`;

describe('ng-add zoneless app', () => {
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
    host.create(
      'src/main.ts',
      `import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
`,
    );
    host.create('src/app/app.config.ts', APP_CONFIG);
    host.create(
      'src/app/app.routes.ts',
      `import { Routes } from '@angular/router';

export const routes: Routes = [];
`,
    );
    host.create(
      'src/app/app.ts',
      `import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('docs');
}
`,
    );
    host.create('src/app/app.html', '<router-outlet />');
  });

  it('should add NgDoc providers without a change-detection provider', async () => {
    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    expect(tree.readContent('src/app/app.config.ts'))
      .toEqual(`import { provideNgDocApp, provideSearchEngine, NgDocDefaultSearchEngine, providePageSkeleton, NG_DOC_DEFAULT_PAGE_SKELETON, provideMainPageProcessor, NG_DOC_DEFAULT_PAGE_PROCESSORS } from "@ng-doc/app";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { NG_DOC_ROUTING, provideNgDocContext } from "@ng-doc/generated";
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter([...routes, ...NG_DOC_ROUTING], withInMemoryScrolling({scrollPositionRestoration: "enabled", anchorScrolling: "enabled"})),
    provideHttpClient(withInterceptorsFromDi()),
    provideNgDocContext(),
    provideNgDocApp(),
    provideSearchEngine(NgDocDefaultSearchEngine),
    providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),
    provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS)
  ]
};
`);
  });

  it('should not add zone.js, a zone provider or withFetch()', async () => {
    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const changed: string = tree.files.map((file: string) => tree.readContent(file)).join('\n');

    expect(changed).not.toMatch(/zone/i);
    expect(changed).not.toContain('withFetch');
    expect(
      JSON.parse(tree.readContent('angular.json')).projects.docs.architect.build.options,
    ).not.toHaveProperty('polyfills');
  });

  it('should keep an explicit zoneless provider as it is', async () => {
    host.overwrite(
      'src/app/app.config.ts',
      APP_CONFIG.replace(
        'provideBrowserGlobalErrorListeners }',
        'provideBrowserGlobalErrorListeners, provideZonelessChangeDetection }',
      ).replace(
        'provideBrowserGlobalErrorListeners(),',
        'provideBrowserGlobalErrorListeners(),\n    provideZonelessChangeDetection(),',
      ),
    );

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const config: string = tree.readContent('src/app/app.config.ts');

    expect(config.match(/provideZonelessChangeDetection\(\)/g)).toHaveLength(1);
    expect(config).not.toContain('provideZoneChangeDetection');
    expect(config).toContain('provideNgDocApp()');
  });

  it('should keep a zone.js application on zone.js', async () => {
    const angularJson = JSON.parse(ANGULAR_JSON);

    angularJson.projects.docs.architect.build.options.polyfills = ['zone.js'];
    host.overwrite('angular.json', JSON.stringify(angularJson, null, 2));
    host.overwrite(
      'src/app/app.config.ts',
      APP_CONFIG.replace(
        'provideBrowserGlobalErrorListeners }',
        'provideBrowserGlobalErrorListeners, provideZoneChangeDetection }',
      ).replace(
        'provideBrowserGlobalErrorListeners(),',
        'provideBrowserGlobalErrorListeners(),\n    provideZoneChangeDetection({ eventCoalescing: true }),',
      ),
    );

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const config: string = tree.readContent('src/app/app.config.ts');

    expect(config.match(/provideZoneChangeDetection\(/g)).toHaveLength(1);
    expect(config).toContain('provideZoneChangeDetection({ eventCoalescing: true })');
    expect(config).not.toContain('provideZonelessChangeDetection');
    // The Vite engine loads the polyfills from its configuration; the Angular build options keep
    // them for the builders that read them.
    expect(
      JSON.parse(tree.readContent('angular.json')).projects.docs.architect['build-angular'].options
        .polyfills,
    ).toEqual(['zone.js']);
    expect(tree.readContent('vite.config.mjs')).toContain("polyfills: ['zone.js']");
  });

  it('should add the layout to the root component of an Angular 22 app', async () => {
    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);

    expect(tree.readContent('src/app/app.html')).toEqual(APP_COMPONENT_CONTENT);
    expect(tree.readContent('src/app/app.ts')).toContain(
      'imports: [RouterOutlet, NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent]',
    );
  });

  it('should extend an existing provideHttpClient call instead of adding a second one', async () => {
    host.overwrite(
      'src/app/app.config.ts',
      APP_CONFIG.replace(
        "import { provideRouter } from '@angular/router';",
        "import { provideHttpClient, withFetch } from '@angular/common/http';\nimport { provideRouter } from '@angular/router';",
      ).replace(
        'provideRouter(routes)',
        'provideRouter(routes),\n    provideHttpClient(withFetch())',
      ),
    );

    const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', OPTIONS, host);
    const config: string = tree.readContent('src/app/app.config.ts');

    expect(config.match(/provideHttpClient\(/g)).toHaveLength(1);
    // The application's own features stay; NgDoc only adds the one it needs.
    expect(config).toContain('provideHttpClient(withFetch(), withInterceptorsFromDi())');
    expect(config).toContain(
      "import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';",
    );
  });
});
