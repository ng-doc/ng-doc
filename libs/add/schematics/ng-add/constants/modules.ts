export const GENERATED_PATH: string = '@ng-doc/generated';

export interface ImportModule {
	initializer: string;
	imports: EntityImport[];
}

export interface EntityImport {
	name: string;
	path: string;
}

export const MAIN_MODULES: readonly ImportModule[] = [
	{
		initializer: 'BrowserAnimationsModule',
		imports: [{name: 'BrowserAnimationsModule', path: '@angular/platform-browser/animations'}],
	},
	{
		initializer: 'NgDocNavbarModule',
		imports: [{name: 'NgDocNavbarModule', path: '@ng-doc/app/components/navbar'}],
	},
	{
		initializer: 'NgDocSidebarModule',
		imports: [{name: 'NgDocSidebarModule', path: '@ng-doc/app/components/sidebar'}],
	},
	{
		initializer:
			"RouterModule.forRoot(NG_DOC_ROUTING, {scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled', scrollOffset: [0, 70]})",
		imports: [
			{name: 'RouterModule', path: '@angular/router'},
			{
				name: 'NG_DOC_ROUTING',
				path: GENERATED_PATH,
			},
		],
	},
	{
		initializer: 'NgDocModule.forRoot()',
		imports: [{name: 'NgDocModule', path: '@ng-doc/app'}],
	},
	{
		initializer: 'NgDocGeneratedModule.forRoot()',
		imports: [{name: 'NgDocGeneratedModule', path: GENERATED_PATH}],
	},
];
