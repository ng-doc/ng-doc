import {HostTree} from '@angular-devkit/schematics';
import {SchematicTestRunner, UnitTestTree} from '@angular-devkit/schematics/testing';
import {createProject, createSourceFile, saveActiveProject, setActiveProject} from 'ng-morph';
import {join} from 'path';

const collectionPath: string = join(__dirname, '../../collection.json');

describe('page', () => {
	let host: UnitTestTree;
	let runner: SchematicTestRunner;

	beforeEach(() => {
		host = new UnitTestTree(new HostTree());
		runner = new SchematicTestRunner('schematics', collectionPath);

		setActiveProject(createProject(host));
	});

	it('should generate page entity', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'page',
			{
				path: 'test',
				title: 'My Page',
			},
			host,
		);

		expect(tree.exists('test/my-page/index.md')).toBe(true);
		expect(tree.readText('test/my-page/ng-doc.page.ts')).toBe(`import {page} from '@ng-doc/core';

export default page({
\ttitle: \`My Page\`,
\tmdFile: './index.md',
});
`);
	});

	it('should generate page entity with custom route', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'page',
			{
				path: 'test',
				title: 'my-page',
				route: 'custom-route',
			},
			host,
		);

		expect(tree.exists('test/my-page/index.md')).toBe(true);
		expect(tree.readText('test/my-page/ng-doc.page.ts')).toBe(`import {page} from '@ng-doc/core';

export default page({
\ttitle: \`my-page\`,
\tmdFile: './index.md',
\troute: \`custom-route\`,
});
`);
	});

	it('should generate page entity with order', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'page',
			{
				path: 'test',
				title: 'my-page',
				order: 1,
			},
			host,
		);

		expect(tree.exists('test/my-page/index.md')).toBe(true);
		expect(tree.readText('test/my-page/ng-doc.page.ts')).toBe(`import {page} from '@ng-doc/core';

export default page({
\ttitle: \`my-page\`,
\tmdFile: './index.md',
\torder: 1,
});
`);
	});

	it('should generate page entity with module', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'page',
			{
				path: 'test',
				title: 'my-page',
				module: true,
			},
			host,
		);

		expect(tree.exists('test/my-page/index.md')).toBe(true);
		expect(tree.readText('test/my-page/ng-doc.module.ts')).toBe(`import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

@NgModule({
\timports: [CommonModule],
})
export class PageModule {}
`);
		expect(tree.readText('test/my-page/ng-doc.page.ts')).toBe(`import {page} from '@ng-doc/core';
import {PageModule} from './ng-doc.module';

export default page({
\ttitle: \`my-page\`,
\tmdFile: './index.md',
\timports: [PageModule],
});
`);
	});

	it('should generate page entity with category', async () => {
		createSourceFile(
			'test/parent-category/ng-doc.category.ts',
			`import {NgDocCategory} from '@ng-doc/core';

const ParentCategory: NgDocCategory = {
\ttitle: 'parent-category',
};

export default ParentCategory;
`,
		);
		saveActiveProject();

		const tree: UnitTestTree = await runner.runSchematic(
			'page',
			{
				path: 'test/parent-category',
				title: 'my-page',
				category: true,
			},
			host,
		);

		expect(tree.exists('test/parent-category/my-page/index.md')).toBe(true);
		expect(tree.readText('test/parent-category/my-page/ng-doc.page.ts')).toBe(`import {page} from '@ng-doc/core';
import parentCategory from '../ng-doc.category';

export default page({
\ttitle: \`my-page\`,
\tmdFile: './index.md',
\tcategory: parentCategory,
});
`);
	});

	it('should remove slashed from title', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'page',
			{
				path: 'test',
				title: '/folder/my-page/',
			},
			host,
		);

		expect(tree.exists('test/folder-my-page/index.md')).toBe(true);
		expect(tree.readText('test/folder-my-page/ng-doc.page.ts')).toBe(`import {page} from '@ng-doc/core';

export default page({
\ttitle: \`folder-my-page\`,
\tmdFile: './index.md',
});
`);
	});
});
