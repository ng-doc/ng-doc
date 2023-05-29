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
				title: 'my-page',
			},
			host,
		);

		expect(tree.exists('test/my-page/index.md')).toBe(true);
		expect(tree.readText('test/my-page/ng-doc.page.ts')).toBe(`import {NgDocPage} from '@ng-doc/core';

const MyPagePage: NgDocPage = {
\ttitle: \`my-page\`,
\tmdFile: './index.md',
};

export default MyPagePage;
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
		expect(tree.readText('test/my-page/ng-doc.page.ts')).toBe(`import {NgDocPage} from '@ng-doc/core';

const MyPagePage: NgDocPage = {
\ttitle: \`my-page\`,
\tmdFile: './index.md',
\troute: \`custom-route\`,
};

export default MyPagePage;
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
		expect(tree.readText('test/my-page/ng-doc.page.ts')).toBe(`import {NgDocPage} from '@ng-doc/core';

const MyPagePage: NgDocPage = {
\ttitle: \`my-page\`,
\tmdFile: './index.md',
    order: 1,
};

export default MyPagePage;
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
\t// Declare you demo components here
\tdeclarations: [],
})
export class MyPagePageModule {}
`);
		expect(tree.readText('test/my-page/ng-doc.page.ts')).toBe(`import {NgDocPage} from '@ng-doc/core';
import {MyPagePageModule} from './ng-doc.module';

const MyPagePage: NgDocPage = {
\ttitle: \`my-page\`,
\tmdFile: './index.md',
    imports: [MyPagePageModule],
};

export default MyPagePage;
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
		expect(tree.readText('test/parent-category/my-page/ng-doc.page.ts')).toBe(`import {NgDocPage} from '@ng-doc/core';
import ParentCategory from '../ng-doc.category';

const MyPagePage: NgDocPage = {
\ttitle: \`my-page\`,
\tmdFile: './index.md',
\tcategory: ParentCategory,
};

export default MyPagePage;
`);
	});
});
