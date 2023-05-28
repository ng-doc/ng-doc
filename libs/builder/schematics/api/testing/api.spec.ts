import {HostTree} from '@angular-devkit/schematics';
import {SchematicTestRunner, UnitTestTree} from '@angular-devkit/schematics/testing';
import {createProject, setActiveProject} from 'ng-morph';
import {join} from 'path';

const collectionPath: string = join(__dirname, '../../collection.json');

describe('api', () => {
	let host: UnitTestTree;
	let runner: SchematicTestRunner;

	beforeEach(() => {
		host = new UnitTestTree(new HostTree());
		runner = new SchematicTestRunner('schematics', collectionPath);

		setActiveProject(createProject(host));
	});

	it('should generate api entity', async () => {
		const tree: UnitTestTree = await runner.runSchematic('api', {path: 'test'}, host);

		expect(tree.readText('test/ng-doc.api.ts')).toBe(`import {NgDocApi} from '@ng-doc/core';

const Api: NgDocApi = {
\ttitle: 'API',
\tscopes: [
\t\t// Add the paths to the source code of your project, based on which you want to generate the API here
\t],
};

export default Api;
`);
	});
});
