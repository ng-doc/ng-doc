export const NG_DOC_ASSETS: Array<{output: string; input: string; glob: string}> = [
	{
		glob: '**/*',
		input: './node_modules/@ng-doc/ui-kit/assets',
		output: 'assets',
	},
	{
		glob: '**/*',
		input: './node_modules/@ng-doc/app/assets',
		output: 'assets',
	},
	{
		glob: '**/*',
		input: './node_modules/@ng-doc/builder/generated/assets',
		output: 'assets',
	},
];
