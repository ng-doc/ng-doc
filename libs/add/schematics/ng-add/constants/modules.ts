export const GENERATED_PATH: string = '@ng-doc/generated';

export interface EntityImport {
	name: string;
	path: string;
}

export interface ImportConstant {
	initializer: string;
	imports: EntityImport[];
}

export interface AppImports {
	imports: ImportConstant[];
	providers: ImportConstant[];
}

export const NG_DOC_COMPONENT_IMPORTS: ImportConstant[] = [
	{
		initializer: 'NgDocNavbarComponent',
		imports: [{ name: 'NgDocNavbarComponent', path: '@ng-doc/app' }],
	},
	{
		initializer: 'NgDocSidebarComponent',
		imports: [{ name: 'NgDocSidebarComponent', path: '@ng-doc/app' }],
	},
];

const NG_DOC_PROVIDERS: ImportConstant[] = [
	{
		initializer: 'provideNgDocContext()',
		imports: [{ name: 'provideNgDocContext', path: GENERATED_PATH }],
	},
	{
		initializer: 'provideSearchEngine(NgDocDefaultSearchEngine)',
		imports: [
			{ name: 'provideSearchEngine', path: '@ng-doc/app' },
			{ name: 'NgDocDefaultSearchEngine', path: '@ng-doc/app' },
		],
	},
	{
		initializer: 'providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON)',
		imports: [
			{ name: 'providePageSkeleton', path: '@ng-doc/app' },
			{ name: 'NG_DOC_DEFAULT_PAGE_SKELETON', path: '@ng-doc/app' },
		],
	},
	{
		initializer: 'providePageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS)',
		imports: [
			{ name: 'providePageProcessor', path: '@ng-doc/app' },
			{ name: 'NG_DOC_DEFAULT_PAGE_PROCESSORS', path: '@ng-doc/app' },
		],
	},
];

export const MODULE_APP: AppImports = {
	imports: [
		{
			initializer: 'BrowserAnimationsModule',
			imports: [{ name: 'BrowserAnimationsModule', path: '@angular/platform-browser/animations' }],
		},
		{
			initializer:
				"RouterModule.forRoot(NG_DOC_ROUTING, {scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled', scrollOffset: [0, 70]})",
			imports: [
				{ name: 'RouterModule', path: '@angular/router' },
				{
					name: 'NG_DOC_ROUTING',
					path: GENERATED_PATH,
				},
			],
		},
		...NG_DOC_COMPONENT_IMPORTS,
	],
	providers: NG_DOC_PROVIDERS,
};

export const STANDALONE_APP: AppImports = {
	imports: NG_DOC_COMPONENT_IMPORTS,
	providers: [
		{
			initializer: 'provideAnimations()',
			imports: [{ name: 'provideAnimations', path: '@angular/platform-browser/animations' }],
		},
		{
			initializer: 'provideHttpClient(withInterceptorsFromDi())',
			imports: [
				{ name: 'provideHttpClient', path: '@angular/common/http' },
				{ name: 'withInterceptorsFromDi', path: '@angular/common/http' },
			],
		},
		{
			initializer:
				'provideRouter(NG_DOC_ROUTING, withInMemoryScrolling({scrollPositionRestoration: "enabled", anchorScrolling: "enabled"}))',
			imports: [
				{ name: 'provideRouter', path: '@angular/router' },
				{ name: 'NG_DOC_ROUTING', path: GENERATED_PATH },
				{ name: 'withInMemoryScrolling', path: '@angular/router' },
			],
		},
		...NG_DOC_PROVIDERS,
	],
};
