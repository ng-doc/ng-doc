import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocTagModule} from '@ng-doc/ui-kit';

import {NgDocDeclarationTagComponent} from './declaration-tag.component';

@NgModule({
	declarations: [NgDocDeclarationTagComponent],
	imports: [CommonModule, NgDocTagModule],
	exports: [NgDocDeclarationTagComponent],
})
export class NgDocDeclarationTagModule {}
