import { Schema } from '../schema';

/**
 *
 * @param options
 */
export function getNgDocAssets(options: Schema): Array<{
	output: string;
	input: string;
	glob: string;
}> {
	return [
		{
			glob: '**/*',
			input: 'node_modules/@ng-doc/app/assets',
			output: 'assets/ng-doc/app',
		},
		{
			glob: '**/*',
			input: 'node_modules/@ng-doc/ui-kit/assets',
			output: 'assets/ng-doc/ui-kit',
		},
		{
			glob: '**/*',
			input: `.ng-doc/${options.project}/assets`,
			output: 'assets/ng-doc',
		},
	];
}
