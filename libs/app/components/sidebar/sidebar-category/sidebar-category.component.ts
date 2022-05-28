import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'ng-doc-sidebar-category',
	templateUrl: './sidebar-category.component.html',
	styleUrls: ['./sidebar-category.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSidebarCategoryComponent {}
