import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLink} from '@angular/router';
import {NgDocButtonIconModule, NgDocIconModule, NgDocTextModule} from '@ng-doc/ui-kit';

import {NgDocBreadcrumbComponent} from './breadcrumb.component';

@NgModule({
	declarations: [NgDocBreadcrumbComponent],
	imports: [CommonModule, NgDocIconModule, RouterLink, NgDocButtonIconModule, NgDocTextModule],
	exports: [NgDocBreadcrumbComponent],
})
export class NgDocBreadcrumbModule {}
