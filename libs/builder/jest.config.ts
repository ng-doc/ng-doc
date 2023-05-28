/* eslint-disable */
export default {
	displayName: 'builder',
	preset: '../../jest.preset.js',
	globals: {
		Uint8Array: Uint8Array,
		ArrayBuffer: ArrayBuffer
	},
	transform: {
		'^.+\\.[tj]s$': [
			'ts-jest',
			{
				tsconfig: '<rootDir>/tsconfig.spec.json',
			},
		],
	},
	moduleFileExtensions: ['ts', 'js', 'html'],
	coverageDirectory: '../../coverage/libs/builder',
};
