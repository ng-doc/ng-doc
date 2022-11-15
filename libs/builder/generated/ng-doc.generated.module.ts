import {ModuleWithProviders, NgModule} from '@angular/core';

import {ngDocContextProvider} from './ng-doc.context';
import {ngDocKeywordsDictionaryProvider} from './ng-doc.keywords-dictionary';

@NgModule()
export class NgDocGeneratedModule {
	static forRoot(): ModuleWithProviders<NgDocGeneratedModule> {
		return {
			ngModule: NgDocGeneratedModule,
			providers: [ngDocContextProvider, ngDocKeywordsDictionaryProvider],
		};
	}
}
