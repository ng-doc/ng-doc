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

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {category} from '@ng-doc/core';

export default category({
\ttitle: 'My Category',
});
`);
	});

	it('should generate category entity with route', async () => {
		const tree: UnitTestTree = await runner.runSchematic(
			'category',
			{
				path: 'test',
				title: 'my-category',
				route: 'my-route',
			},
			host,
		);

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {category} from '@ng-doc/core';

export default category({
\ttitle: 'my-category',
\troute: \`my-route\`,
});
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

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {category} from '@ng-doc/core';

export default category({
\ttitle: 'my-category',
\torder: \`5\`,
});
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

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {category} from '@ng-doc/core';

export default category({
\ttitle: 'my-category',
\texpandable: true,
});
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

		expect(tree.readText('test/my-category/ng-doc.category.ts')).toBe(`import {category} from '@ng-doc/core';

export default category({
\ttitle: 'my-category',
\texpanded: true,
});
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
			.toBe(`import {category} from '@ng-doc/core';
import parentCategory from '../ng-doc.category';

export default category({
\ttitle: 'child-category',
\tcategory: parentCategory,
});
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

		expect(tree.readText('test/folder-my-category/ng-doc.category.ts')).toBe(`import {category} from '@ng-doc/core';

export default category({
\ttitle: 'folder-my-category',
});
`);
	})
});
