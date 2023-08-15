import {NgDocApi} from '@ng-doc/core';

export const api: NgDocApi = {
	title: 'API References',
	keyword: 'ApiReferences',
	scopes: [
		{
			name: '@ng-doc/app',
			route: 'app',
			include: 'libs/app/**/*.ts',
		},
		{
			name: '@ng-doc/builder',
			route: 'builder',
			include: [
				'libs/builder/interfaces/**.ts',
				'libs/builder/types/**.ts',
				'libs/builder/schematics/**/*.ts',
			],
			exclude: ['libs/builder/**/**.spec.ts'],
		},
		{
			name: '@ng-doc/ui-kit',
			route: 'ui-kit',
			include: 'libs/ui-kit/**/*.ts',
		},
		{
			name: '@ng-doc/core',
			route: 'core',
			include: 'libs/core/**/*.ts',
		},
		{
			name: '@ng-doc/keywords-loaders',
			route: 'keywords-loaders',
			include: 'libs/keywords-loaders/index.ts',
		},
	],
};

export default api;
