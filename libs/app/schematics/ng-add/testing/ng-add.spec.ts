import {HostTree} from '@angular-devkit/schematics';
import {SchematicTestRunner, UnitTestTree} from '@angular-devkit/schematics/testing';
import {APP_COMPONENT_CONTENT} from '@ng-doc/app/schematics/ng-add/constants/app-component-content';
import {NG_DOC_VERSION} from '@ng-doc/app/schematics/ng-add/constants/version';
import {createAngularJson} from '@ng-doc/app/schematics/ng-add/utils/create-angular-json';
import {createProject, createSourceFile, saveActiveProject, setActiveProject} from 'ng-morph';
import {join} from 'path';

import {Schema} from '../schema';

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

		expect(tree.readContent('test/app/app.module.ts'))
			.toEqual(`import { NgDocUiKitRootModule } from "@ng-doc/ui-kit";
import { NgDocModule } from "@ng-doc/app";
import { NG_DOC_ROUTING, NgDocGeneratedModule } from "@ng-doc/builder/generated";
import { RouterModule } from "@angular/router";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import {NgModule} from '@angular/core';
import {AppComponent} from './app.component';

@NgModule({declarations: [AppComponent],
        imports: [BrowserAnimationsModule, RouterModule.forRoot(NG_DOC_ROUTING), NgDocModule.forRoot(), NgDocUiKitRootModule.forRoot(), NgDocGeneratedModule.forRoot()]
    })
export class AppModule {}
`);
	});

	it('should add styles', async () => {
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
    	"root": ".",
        "architect": {
          "build": {
            "options": {
              "main": "test/main.ts",
              "styles": [
                "@ng-doc/app/styles/global.scss",
                "highlight.js/styles/default.css",
                "highlight.js/styles/vs.css"
              ]
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
