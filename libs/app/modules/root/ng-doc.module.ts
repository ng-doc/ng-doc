import {ModuleWithProviders, NgModule} from '@angular/core';
import {NgDocRootModule} from '@ng-doc/app/components/root';

@NgModule({
	exports: [NgDocRootModule],
})
export class NgDocModule {
	static forRoot(): ModuleWithProviders<NgDocModule> {
		return {
			ngModule: NgDocModule,
		};
	}
}
