import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocDeclarationTagProcessorDirective} from './declaration-tag-processor.directive';

@NgModule({
	declarations: [NgDocDeclarationTagProcessorDirective],
	imports: [CommonModule],
	exports: [NgDocDeclarationTagProcessorDirective],
})
export class NgDocDeclarationTagProcessorModule {}
