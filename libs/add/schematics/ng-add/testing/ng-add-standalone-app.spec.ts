import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { createProject, createSourceFile, saveActiveProject, setActiveProject } from 'ng-morph';
import { join } from 'path';

import { APP_COMPONENT_CONTENT } from '../constants/app-component-content';
import { NG_DOC_VERSION } from '../constants/version';
import { Schema } from '../schema';
import { createAngularJson } from '../utils/create-angular-json';
import { createGitIgnore } from '../utils/create-git-ignore';
import { createTsConfigs } from '../utils/create-ts-configs';

const collectionPath: string = join(__dirname, '../../collection.json');

describe('ng-add standalone app', () => {
	let host: UnitTestTree;
	let runner: SchematicTestRunner;

	beforeEach(() => {
		host = new UnitTestTree(new HostTree());
		runner = new SchematicTestRunner('schematics', collectionPath);

		setActiveProject(createProject(host));

		createSourceFile('package.json', '{"dependencies": {"@angular/core": "~13.0.0"}}');
		createAngularJson();
		createTsConfigs();
		createGitIgnore();
		createMainFiles();
		saveActiveProject();
	});

	it('should add main modules in package.json', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematic('ng-add', options, host);

		expect(tree.readContent('package.json')).toEqual(
			`{
  "dependencies": {
    "@angular/core": "~13.0.0",
    "@ng-doc/app": "${NG_DOC_VERSION}",
    "@ng-doc/builder": "${NG_DOC_VERSION}",
    "@ng-doc/core": "${NG_DOC_VERSION}",
    "@ng-doc/ui-kit": "${NG_DOC_VERSION}"
  }
}`,
		);
	});

	it('should replace content of the app components template', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', options, host);

		expect(tree.readContent('test/app/app.template.html')).toEqual(APP_COMPONENT_CONTENT);
	});

	it('should update app tsconfig', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', options, host);

		expect(tree.readContent('test/tsconfig.app.json')).toEqual(`
{
  "compilerOptions": {
    "allowSyntheticDefaultImports": true
  },
  "extends": "../tsconfig.json"
}
`);
	});

	it('should update tsconfig', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', options, host);

		expect(tree.readContent('tsconfig.json')).toEqual(`{
  "compilerOptions": {
    "paths": {
      "@ng-doc/generated": [
        ".ng-doc//index.ts"
      ],
      "@ng-doc/generated/*": [
        ".ng-doc//*"
      ]
    }
  }
}`);
	});

	it('should add .ng-doc folder to gitignore tsconfig', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', options, host);

		expect(tree.readContent('.gitignore')).toEqual(`.cache

# NgDoc files
.ng-doc`);
	});

	it('should add NgDoc providers', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', options, host);

		expect(tree.readContent('test/main.ts'))
			.toEqual(`import { provideNgDocApp, provideSearchEngine, NgDocDefaultSearchEngine, providePageSkeleton, NG_DOC_DEFAULT_PAGE_SKELETON, provideMainPageProcessor, NG_DOC_DEFAULT_PAGE_PROCESSORS } from "@ng-doc/app";
import { NG_DOC_ROUTING, provideNgDocContext } from "@ng-doc/generated";
import { provideRouter, withInMemoryScrolling } from "@angular/router";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideAnimations } from "@angular/platform-browser/animations";
import { bootstrapApplication } from '@angular/platform-browser';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';

  if (environment.production) {
    enableProdMode();
  }

  bootstrapApplication(AppComponent, {providers: [provideAnimations(), provideHttpClient(withInterceptorsFromDi()), provideRouter(NG_DOC_ROUTING, withInMemoryScrolling({scrollPositionRestoration: "enabled", anchorScrolling: "enabled"})), provideNgDocContext(), provideNgDocApp(), provideSearchEngine(NgDocDefaultSearchEngine), providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON), provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS)]})
    .catch(err => console.log(err));
  `);
	});

	it('should import main components', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', options, host);

		expect(tree.readContent('test/app/app.component.ts'))
			.toEqual(`import { NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent } from "@ng-doc/app";
import { Component } from '@angular/core';

@Component({
\ttemplateUrl: './app.template.html',
\tstandalone: true,
    imports: [NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent]
})
export class AppComponent {}`);
	});

	it('should update angular.json', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematic('ng-add-setup-project', options, host);

		expect(tree.readContent('angular.json')).toEqual(`
{
  "version": 1,
  "defaultProject": "demo",
  "projects": {
    "demo": {
    \t"root": ".",
    \t"sourceRoot": "src",
        "architect": {
          "build": {
            "options": {
              "main": "test/main.ts",
              "tsConfig": "test/tsconfig.app.json",
              "styles": [
                "node_modules/@ng-doc/app/styles/global.css"
              ],
              "assets": [
                {
                  "glob": "**/*",
                  "input": "node_modules/@ng-doc/app/assets",
                  "output": "assets/ng-doc/app"
                },
                {
                  "glob": "**/*",
                  "input": "node_modules/@ng-doc/ui-kit/assets",
                  "output": "assets/ng-doc/ui-kit"
                },
                {
                  "glob": "**/*",
                  "input": ".ng-doc//assets",
                  "output": "assets/ng-doc"
                }
              ],
              "allowedCommonJsDependencies": [
                "@ng-doc/core"
              ],
             },
             "configurations": {
              \t"production": {
              \t\t"sourceMap": true,
\t\t\t\t\t"optimization": true,
\t\t\t\t\t"buildOptimizer": true,
\t\t\t\t\t"aot": true
              \t}
              },
              "builder": "@ng-doc/builder:browser"
          }
        }
    }
  }
}`);
	});
});

/**
 *
 */
function createMainFiles(): void {
	createSourceFile(
		'test/main.ts',
		`import { bootstrapApplication } from '@angular/platform-browser';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';

  if (environment.production) {
    enableProdMode();
  }

  bootstrapApplication(AppComponent)
    .catch(err => console.log(err));
  `,
	);

	createSourceFile(
		'test/app/app.component.ts',
		`import { Component } from '@angular/core';

@Component({
	templateUrl: './app.template.html',
	standalone: true,
})
export class AppComponent {}`,
	);

	createSourceFile('test/app/app.template.html', `<app></app>`);
}
