import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocNavigation} from '@ng-doc/app/interfaces';

@Component({
	selector: 'ng-doc-sidebar-category',
	templateUrl: './sidebar-category.component.html',
	styleUrls: ['./sidebar-category.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSidebarCategoryComponent {
	@Input()
	category?: NgDocNavigation;
}
