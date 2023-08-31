import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { createProject, createSourceFile, saveActiveProject, setActiveProject } from 'ng-morph';
import { join } from 'path';

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
		expect(tree.readText('test/my-page/ng-doc.page.ts'))
			.toBe(`import {NgDocPage} from '@ng-doc/core';

const MyPagePage: NgDocPage = {
\ttitle: \`My Page\`,
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
		expect(tree.readText('test/my-page/ng-doc.page.ts'))
			.toBe(`import {NgDocPage} from '@ng-doc/core';

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
		expect(tree.readText('test/my-page/ng-doc.page.ts'))
			.toBe(`import {NgDocPage} from '@ng-doc/core';

const MyPagePage: NgDocPage = {
\ttitle: \`my-page\`,
\tmdFile: './index.md',
\torder: 1,
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
		expect(tree.readText('test/my-page/ng-doc.module.ts'))
			.toBe(`import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

@NgModule({
\timports: [CommonModule],
\t// Declare you demo components here
\tdeclarations: [],
})
export class MyPagePageModule {}
`);
		expect(tree.readText('test/my-page/ng-doc.page.ts'))
			.toBe(`import {NgDocPage} from '@ng-doc/core';
import {MyPagePageModule} from './ng-doc.module';

const MyPagePage: NgDocPage = {
\ttitle: \`my-page\`,
\tmdFile: './index.md',
\timports: [MyPagePageModule],
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
		expect(tree.readText('test/parent-category/my-page/ng-doc.page.ts'))
			.toBe(`import {NgDocPage} from '@ng-doc/core';
import ParentCategory from '../ng-doc.category';

const MyPagePage: NgDocPage = {
\ttitle: \`my-page\`,
\tmdFile: './index.md',
\tcategory: ParentCategory,
};

export default MyPagePage;
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
		expect(tree.readText('test/folder-my-page/ng-doc.page.ts'))
			.toBe(`import {NgDocPage} from '@ng-doc/core';

const FolderMyPagePage: NgDocPage = {
\ttitle: \`folder-my-page\`,
\tmdFile: './index.md',
};

export default FolderMyPagePage;
`);
	});

	it('should throw error if title has forbidden characters and --name was not provided', async () => {
		try {
			await runner.runSchematic(
				'page',
				{
					path: 'test',
					title: 'Пейжд',
				},
				host,
			);
		} catch (e) {
			expect((e as Error).message).toBeTruthy();
		}
	});

	it('should throw error if name has forbidden characters', async () => {
		try {
			await runner.runSchematic(
				'page',
				{
					path: 'test',
					title: 'page',
					name: 'Пейжд',
				},
				host,
			);
		} catch (e) {
			expect((e as Error).message).toBeTruthy();
		}
	});

	it('should not throw error if title has forbidden characters and --name was provided', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'page',
			{
				path: 'test',
				title: 'Пейжд',
				name: 'page',
			},
			host,
		);

		expect(tree.exists('test/page/index.md')).toBe(true);
		expect(tree.readText('test/page/ng-doc.page.ts')).toBe(`import {NgDocPage} from '@ng-doc/core';

const page: NgDocPage = {
\ttitle: \`Пейжд\`,
\tmdFile: './index.md',
};

export default page;
`);
	});

	it('should remove "page" word from folder path if --name was provided', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'page',
			{
				path: 'test',
				title: 'Test Page',
				name: 'MyPage',
			},
			host,
		);

		expect(tree.exists('test/my/ng-doc.page.ts')).toBe(true);
	});
});
