import {HostTree} from '@angular-devkit/schematics';
import {SchematicTestRunner, UnitTestTree} from '@angular-devkit/schematics/testing';
import {createProject, createSourceFile, saveActiveProject, setActiveProject} from 'ng-morph';
import {join} from 'path';

const collectionPath: string = join(__dirname, '../../collection.json');

describe('category', () => {
	let host: UnitTestTree;
	let runner: SchematicTestRunner;

	beforeEach(() => {
		host = new UnitTestTree(new HostTree());
		runner = new SchematicTestRunner('schematics', collectionPath);

		setActiveProject(createProject(host));
	});

	it('should generate category entity', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'category',
			{
				path: 'test',
				title: 'My Category',
			},
			host,
		);

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {NgDocCategory} from '@ng-doc/core';

const MyCategoryCategory: NgDocCategory = {
\ttitle: 'My Category',
};

export default MyCategoryCategory;
`);
	});

	it('should generate category entity with route', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'category',
			{
				path: 'test',
				title: 'my-category',
				route: 'my-category',
			},
			host,
		);

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {NgDocCategory} from '@ng-doc/core';

const MyCategoryCategory: NgDocCategory = {
\ttitle: 'my-category',
\troute: \`my-category\`,
};

export default MyCategoryCategory;
`);
	});

	it('should generate category entity with order', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'category',
			{
				path: 'test',
				title: 'my-category',
				order: 5,
			},
			host,
		);

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {NgDocCategory} from '@ng-doc/core';

const MyCategoryCategory: NgDocCategory = {
\ttitle: 'my-category',
\torder: \`5\`,
};

export default MyCategoryCategory;
`);
	});

	it('should generate expandable category entity', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'category',
			{
				path: 'test',
				title: 'my-category',
				expandable: true,
			},
			host,
		);

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {NgDocCategory} from '@ng-doc/core';

const MyCategoryCategory: NgDocCategory = {
\ttitle: 'my-category',
\texpandable: true,
};

export default MyCategoryCategory;
`);
	});

	it('should generate category entity with expanded property', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'category',
			{
				path: 'test',
				title: 'my-category',
				expanded: true,
			},
			host,
		);

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {NgDocCategory} from '@ng-doc/core';

const MyCategoryCategory: NgDocCategory = {
\ttitle: 'my-category',
\texpanded: true,
};

export default MyCategoryCategory;
`);
	});

	it('should import parent category', async () => {
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
			'category',
			{
				path: 'test/parent-category',
				title: 'child-category',
				category: true,
			},
			host,
		);

		expect(tree.readText('test/parent-category/child-category/ng-doc.category.ts'))
			.toBe(`import {NgDocCategory} from '@ng-doc/core';
import ParentCategory from '../ng-doc.category';

const ChildCategoryCategory: NgDocCategory = {
\ttitle: 'child-category',
\tcategory: ParentCategory,
};

export default ChildCategoryCategory;
`);
	});

	it('should remove slashes from the title', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'category',
			{
				path: 'test',
				title: '/folder/my-category/',
			},
			host,
		);

		expect(tree.readText('test/folder-my-category/ng-doc.category.ts')).toBe(`import {NgDocCategory} from '@ng-doc/core';

const FolderMyCategoryCategory: NgDocCategory = {
\ttitle: 'folder-my-category',
};

export default FolderMyCategoryCategory;
`);
	})

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
	})

	it('should throw error if name has forbidden characters', async () => {
		try {
			await runner.runSchematic(
				'category',
				{
					path: 'test',
					title: 'category',
					name: 'Категория',
				},
				host,
			);
		} catch (e) {
			expect((e as Error).message).toBeTruthy();
		}
	})

	it('should not throw error if title has forbidden characters and --name was provided', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'category',
			{
				path: 'test',
				title: 'Категория',
				name: 'category',
			},
			host,
		);

		expect(tree.readText('test/category/ng-doc.category.ts')).toBe(`import {NgDocCategory} from '@ng-doc/core';

const category: NgDocCategory = {
\ttitle: 'Категория',
};

export default category;
`);
	})

	it('should remove "category" word from folder path if --name was provided', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'category',
			{
				path: 'test',
				title: 'Test Category',
				name: 'MyCategory',
			},
			host,
		);

		expect(tree.exists('test/my/ng-doc.category.ts')).toBe(true);
	})
});
