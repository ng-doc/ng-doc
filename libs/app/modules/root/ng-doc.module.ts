import {OverlayModule} from '@angular/cdk/overlay';
import {ModuleWithProviders, NgModule} from '@angular/core';
import {NgDocRootModule} from '@ng-doc/app/components/root';

@NgModule({
	imports: [OverlayModule],
	exports: [NgDocRootModule],
})
export class NgDocModule {
	static forRoot(): ModuleWithProviders<NgDocModule> {
		return {
			ngModule: NgDocModule,
		};
	}
}
