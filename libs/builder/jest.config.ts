/* eslint-disable */
export default {
	displayName: 'builder',
	preset: '../../jest.preset.js',
	transform: {
		'^.+\\.[tj]s$': [
			'ts-jest',
			{
				tsconfig: '<rootDir>/tsconfig.spec.json',
			},
		],
	},
	setupFiles: ['../jest.polyfills.js'],
	moduleFileExtensions: ['ts', 'js', 'html'],
	coverageDirectory: '../../coverage/libs/builder',
};
