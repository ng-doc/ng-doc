import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { createProject, createSourceFile, saveActiveProject, setActiveProject } from 'ng-morph';
import { join } from 'path';

const collectionPath: string = join(__dirname, '../../../collection.json');

describe('standalone-pages-migration', () => {
	let host: UnitTestTree;
	let runner: SchematicTestRunner;

	beforeEach(() => {
		host = new UnitTestTree(new HostTree());
		runner = new SchematicTestRunner('schematics', collectionPath);

		setActiveProject(createProject(host));
	});

	it('should migrate module and demos', async () => {
		createSourceFile(
			'page1/ng-doc.dependencies.ts',
			`import {NgDocDependencies} from '@ng-doc/core';

import {ButtonDemoComponent} from './button-demo/button-demo.component';
import {DevelopDemoComponent} from './develop-demo/develop-demo.component';
import {DevelopPageModule} from './ng-doc.module';

const DevelopPageDependencies: NgDocDependencies = {
  module: DevelopPageModule,
  // Add your demos that you are going to use in the page here
  demo: {DevelopDemoComponent, ButtonDemoComponent},
};

export default DevelopPageDependencies;
`,
		);

		createSourceFile(
			'page1/ng-doc.page.ts',
			`import {NgDocPage} from '@ng-doc/core';

export const DevelopPage: NgDocPage = {
  title: 'Develop',
  mdFile: './index.md',
};

export default DevelopPage;
`,
		);
		saveActiveProject();

		const tree: UnitTestTree = await runner.runSchematic('standalone-pages-migration', {}, host);

		expect(tree.get('page1/ng-doc.dependencies.ts')).toBeNull();
		expect(tree.readContent('page1/ng-doc.page.ts'))
			.toEqual(`import {NgDocPage} from '@ng-doc/core';
import { DevelopPageModule } from './ng-doc.module';
import { ButtonDemoComponent } from './button-demo/button-demo.component';
import { DevelopDemoComponent } from './develop-demo/develop-demo.component';

export const DevelopPage: NgDocPage = {
  title: 'Develop',
  mdFile: './index.md',
    imports: [DevelopPageModule],
    demos: {DevelopDemoComponent, ButtonDemoComponent}
};

export default DevelopPage;
`);
	});

	it('should migrate module and playgrounds', async () => {
		createSourceFile(
			'page1/ng-doc.dependencies.ts',
			`import {NgDocDependencies} from '@ng-doc/core';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

import {PlaygroundModule} from './ng-doc.module';

const PlaygroundDependencies: NgDocDependencies = {
  module: PlaygroundModule,
  playgrounds: {
    TagPlayground: {
      target: NgDocTagComponent,
      template: \`<ng-doc-selector>Tag Label</ng-doc-selector>\`,
    },
    TagIconPlayground: {
      target: NgDocTagComponent,
      template: \`
\t\t\t<ng-doc-selector>
\t\t\t\t{{content.icon}}
\t\t\t\tTag Label
\t\t\t</ng-doc-selector>\`,
      content: {
        icon: {
          label: 'email icon',
          template: '<ng-doc-icon icon="at-sign" [size]="16"></ng-doc-icon>',
        },
      },
    },
    TagDataPlayground: {
      target: NgDocTagComponent,
      template: \`<ng-doc-selector>{{data.array | json}}</ng-doc-selector>\`,
      data: {
        array: [1, 2, 3],
      },
    },
  },
};

export default PlaygroundDependencies;
`,
		);

		createSourceFile(
			'page1/ng-doc.page.ts',
			`import {NgDocPage} from '@ng-doc/core';

export const DevelopPage: NgDocPage = {
  title: 'Develop',
  mdFile: './index.md',
};

export default DevelopPage;
`,
		);
		saveActiveProject();

		const tree: UnitTestTree = await runner.runSchematic('standalone-pages-migration', {}, host);

		expect(tree.get('page1/ng-doc.dependencies.ts')).toBeNull();
		expect(tree.readContent('page1/ng-doc.page.ts'))
			.toEqual(`import {NgDocPage} from '@ng-doc/core';
import { PlaygroundModule } from './ng-doc.module';
import { NgDocTagComponent } from '@ng-doc/ui-kit';

export const DevelopPage: NgDocPage = {
  title: 'Develop',
  mdFile: './index.md',
    imports: [PlaygroundModule],
    playgrounds: {
            TagPlayground: {
              target: NgDocTagComponent,
              template: \`<ng-doc-selector>Tag Label</ng-doc-selector>\`,
            },
            TagIconPlayground: {
              target: NgDocTagComponent,
              template: \`
\t\t\t<ng-doc-selector>
\t\t\t\t{{content.icon}}
\t\t\t\tTag Label
\t\t\t</ng-doc-selector>\`,
              content: {
                icon: {
                  label: 'email icon',
                  template: '<ng-doc-icon icon="at-sign" [size]="16"></ng-doc-icon>',
                },
              },
            },
            TagDataPlayground: {
              target: NgDocTagComponent,
              template: \`<ng-doc-selector>{{data.array | json}}</ng-doc-selector>\`,
              data: {
                array: [1, 2, 3],
              },
            },
          }
};

export default DevelopPage;
`);
	});
});
