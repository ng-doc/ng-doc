import {ModuleWithProviders, NgModule} from '@angular/core';
import {ngDocContextProvider} from './ng-doc.context';

@NgModule()
export class NgDocGeneratedModule {
	public static forRoot(): ModuleWithProviders<NgDocGeneratedModule> {
		return {
			ngModule: NgDocGeneratedModule,
			providers: [ngDocContextProvider],
		};
	}
}
