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
		initializer: 'RouterModule.forRoot(NG_DOC_ROUTING)',
		imports: [
			{name: 'RouterModule', path: '@angular/router'},
			{
				name: 'NG_DOC_ROUTING',
				path: '@ng-doc/builder/generated',
			},
		],
	},
	{
		initializer: 'NgDocModule.forRoot()',
		imports: [{name: 'NgDocModule', path: '@ng-doc/app'}],
	},
	{
		initializer: 'NgDocUiKitRootModule.forRoot()',
		imports: [{name: 'NgDocUiKitRootModule', path: '@ng-doc/ui-kit'}],
	},
	{
		initializer: 'NgDocGeneratedModule.forRoot()',
		imports: [{name: 'NgDocGeneratedModule', path: '@ng-doc/builder/generated'}],
	},
];
