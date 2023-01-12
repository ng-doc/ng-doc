import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLink, RouterLinkWithHref} from '@angular/router';
import {NgDocDotModule} from '@ng-doc/ui-kit';

import {NgDocTocComponent} from './toc.component';
import {NgDocTocElementComponent} from './toc-element/toc-element.component';

@NgModule({
	declarations: [NgDocTocComponent, NgDocTocElementComponent],
	imports: [CommonModule, RouterLinkWithHref, NgDocDotModule, RouterLink],
	exports: [NgDocTocComponent, NgDocTocElementComponent],
})
export class NgDocPageMapModule {}
