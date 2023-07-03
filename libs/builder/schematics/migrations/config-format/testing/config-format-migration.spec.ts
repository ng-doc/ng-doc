import {HostTree} from '@angular-devkit/schematics';
import {SchematicTestRunner, UnitTestTree} from '@angular-devkit/schematics/testing';
import {createProject, createSourceFile, saveActiveProject, setActiveProject} from 'ng-morph';
import {join} from 'path';

const collectionPath: string = join(__dirname, '../../../collection.json');

describe('config-format-migration', () => {
	let host: UnitTestTree;
	let runner: SchematicTestRunner;

	beforeEach(() => {
		host = new UnitTestTree(new HostTree());
		runner = new SchematicTestRunner('schematics', collectionPath);

		setActiveProject(createProject(host));
	});

	it('should migrate page', async () => {
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

		const tree: UnitTestTree = await runner.runSchematic('config-format-migration', {}, host);

		expect(tree.readContent('page1/ng-doc.page.ts')).toEqual(`import { page } from '@ng-doc/core';

export default page({
  title: 'Develop',
  mdFile: './index.md',
});
`);
	});

	it('should migrate page with module import', async () => {
		createSourceFile(
			'page1/ng-doc.page.ts',
			`import {NgDocPage} from '@ng-doc/core';
import {PageModule} from './ng-doc.module.ts';

export const DevelopPage: NgDocPage = {
  title: 'Develop',
  mdFile: './index.md',
  imports: [PageModule],
};

export default DevelopPage;
`,
		);

		saveActiveProject();

		const tree: UnitTestTree = await runner.runSchematic('config-format-migration', {}, host);

		expect(tree.readContent('page1/ng-doc.page.ts')).toEqual(`import { page } from '@ng-doc/core';
import {PageModule} from './ng-doc.module.ts';

export default page({
  title: 'Develop',
  mdFile: './index.md',
  imports: [PageModule],
});
`);
	});

	it('should migrate category', async () => {
		createSourceFile(
			'category1/ng-doc.category.ts',
			`import {NgDocCategory} from '@ng-doc/core';
import ParentCategory from '../parent-category/ng-doc.category.ts';

const DevelopCategory: NgDocCategory = {
	  title: 'Develop',
	  parent: ParentCategory,
};

export default DevelopCategory;
`,
		);

		saveActiveProject();

		const tree: UnitTestTree = await runner.runSchematic('config-format-migration', {}, host);

		expect(tree.readContent('category1/ng-doc.category.ts')).toEqual(`import { category } from '@ng-doc/core';
import ParentCategory from '../parent-category/ng-doc.category.ts';

export default category({
	  title: 'Develop',
	  parent: ParentCategory,
});
`);
	});

	it('should migrate api', async () => {
		createSourceFile(
			'api1/ng-doc.api.ts',
			`import {NgDocApi} from '@ng-doc/core';

const Api: NgDocApi = {
	  title: 'API',
	  scopes: [{
	    name: 'Components',
	    route: 'components',
	    include: 'src/app/components/**/*.ts',
	  }],
};

export default Api;
`,
		);
		saveActiveProject();

		const tree: UnitTestTree = await runner.runSchematic('config-format-migration', {}, host);

		expect(tree.readContent('api1/ng-doc.api.ts')).toEqual(`import { api } from '@ng-doc/core';

export default api({
	  title: 'API',
	  scopes: [{
	    name: 'Components',
	    route: 'components',
	    include: 'src/app/components/**/*.ts',
	  }],
});
`);
	});

	it('should migrate config', async () => {
		createSourceFile(
			'config1/ng-doc.config.ts',
			`import {NgDocConfiguration} from '@ng-doc/builder';

const config: NgDocConfiguration = {
	pages: 'src',
}

export default config;
`,
		);
		saveActiveProject();

		const tree: UnitTestTree = await runner.runSchematic('config-format-migration', {}, host);

		expect(tree.readContent('config1/ng-doc.config.ts')).toEqual(`import { config } from '@ng-doc/builder';

export default config({
	pages: 'src',
});
`);
	});
});
