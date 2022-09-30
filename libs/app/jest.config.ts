/* eslint-disable */
export default {
	displayName: 'app',
	preset: '../../jest.preset.js',
	setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
	globals: {
		'ts-jest': {
			tsconfig: '<rootDir>/tsconfig.spec.json',
			stringifyContentPathRegex: '\\.(HTML|svg)$',
		},
	},
	coverageDirectory: '../../coverage/libs/app',
	transform: {
		'^.+\\.(ts|mjs|js|html)$': 'jest-preset-angular',
	},
	transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
	snapshotSerializers: [
		'jest-preset-angular/build/serializers/no-ng-attributes',
		'jest-preset-angular/build/serializers/ng-snapshot',
		'jest-preset-angular/build/serializers/HTML-comment',
	],
};
