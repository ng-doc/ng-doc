import {NgModule} from '@angular/core';
import {NgDocDeclarationTagModule} from '@ng-doc/app/components/declaration-tag';

import {NgDocDeclarationTagProcessorDirective} from './declaration-tag-processor.directive';

@NgModule({
	declarations: [NgDocDeclarationTagProcessorDirective],
	imports: [NgDocDeclarationTagModule],
	exports: [NgDocDeclarationTagProcessorDirective],
})
export class NgDocDeclarationTagProcessorModule {}
