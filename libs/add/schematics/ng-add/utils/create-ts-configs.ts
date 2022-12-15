import {createSourceFile} from 'ng-morph';

/**
 *
 */
export function createTsConfigs(): void {
	createSourceFile(
		'test/tsconfig.app.json',
		`
{
  "extends": "../tsconfig.json"
}
`,
	);

	createSourceFile(
		'tsconfig.json',
		`{
  "compilerOptions": {
    "paths": {}
  }
}`,
	);
}
