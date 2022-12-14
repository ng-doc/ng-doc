import {HostTree} from '@angular-devkit/schematics';
import {SchematicTestRunner, UnitTestTree} from '@angular-devkit/schematics/testing';
import {createProject, createSourceFile, saveActiveProject, setActiveProject} from 'ng-morph';
import {join} from 'path';

import {APP_COMPONENT_CONTENT} from '../constants/app-component-content';
import {NG_DOC_VERSION} from '../constants/version';
import {Schema} from '../schema';
import {createAngularJson} from '../utils/create-angular-json';

const collectionPath: string = join(__dirname, '../../collection.json');

describe('ng-add', () => {
	let host: UnitTestTree;
	let runner: SchematicTestRunner;

	beforeEach(() => {
		host = new UnitTestTree(new HostTree());
		runner = new SchematicTestRunner('schematics', collectionPath);

		setActiveProject(createProject(host));

		createSourceFile('package.json', '{"dependencies": {"@angular/core": "~13.0.0"}}');
		createAngularJson();
		createMainFiles();
		saveActiveProject();
	});

	it('should add main modules in package.json', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematicAsync('ng-add', options, host).toPromise();

		expect(tree.readContent('package.json')).toEqual(
			`{
  "dependencies": {
    "@angular/core": "~13.0.0",
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

		const tree: UnitTestTree = await runner.runSchematicAsync('ng-add', options, host).toPromise();

		expect(tree.readContent('test/app/app.template.html')).toEqual(APP_COMPONENT_CONTENT);
	});

	it('should add NgDoc modules', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematicAsync('ng-add', options, host).toPromise();

		expect(tree.readContent('test/app/app.module.ts')).toEqual(`import { NgDocModule } from "@ng-doc/app";
import { NG_DOC_ROUTING, NgDocGeneratedModule } from "@ng-doc/builder/generated";
import { RouterModule } from "@angular/router";
import { NgDocSidebarModule } from "@ng-doc/app/components/sidebar";
import { NgDocNavbarModule } from "@ng-doc/app/components/navbar";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import {NgModule} from '@angular/core';
import {AppComponent} from './app.component';

@NgModule({declarations: [AppComponent],
        imports: [BrowserAnimationsModule, NgDocNavbarModule, NgDocSidebarModule, RouterModule.forRoot(NG_DOC_ROUTING), NgDocModule.forRoot(), NgDocGeneratedModule.forRoot()]
    })
export class AppModule {}
`);
	});

	it('should update angular.json', async () => {
		const options: Schema = {
			project: '',
		};

		const tree: UnitTestTree = await runner.runSchematicAsync('ng-add', options, host).toPromise();

		expect(tree.readContent('angular.json')).toEqual(`
{
  "version": 1,
  "defaultProject": "demo",
  "projects": {
    "demo": {
    \t"root": ".",
        "architect": {
          "build": {
            "options": {
              "main": "test/main.ts",
              "styles": [
                "./node_modules/@ng-doc/app/styles/global.css"
              ],
              "assets": [
                {
                  "glob": "**/*",
                  "input": "./node_modules/@ng-doc/ui-kit/assets",
                  "output": "assets"
                },
                {
                  "glob": "**/*",
                  "input": "./node_modules/@ng-doc/app/assets",
                  "output": "assets"
                },
                {
                  "glob": "**/*",
                  "input": "./node_modules/@ng-doc/builder/generated/assets",
                  "output": "assets"
                }
              ]
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
		`import {platformBrowserDynamic} from '@angular/platform-browser-dynamic';
  import {AppModule} from './app/app.module';
  import {environment} from './environments/environment';

  if (environment.production) {
    enableProdMode();
  }
  platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch(err => console.log(err));
  `,
	);

	createSourceFile(
		'test/app/app.module.ts',
		`import {NgModule} from '@angular/core';
import {AppComponent} from './app.component';

@NgModule({declarations: [AppComponent]})
export class AppModule {}
`,
	);

	createSourceFile(
		'test/app/app.component.ts',
		`import {Component} from '@angular/core';
import {AppComponent} from './app.component';

@Component({templateUrl: './app.template.html'})
export class AppComponent {}`,
	);

	createSourceFile('test/app/app.template.html', `<app></app>`);
}
