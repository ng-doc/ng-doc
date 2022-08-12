import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocNavigation} from '@ng-doc/app/interfaces';

@Component({
	selector: 'ng-doc-sidebar-item',
	templateUrl: './sidebar-item.component.html',
	styleUrls: ['./sidebar-item.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSidebarItemComponent {
	@Input()
	item?: NgDocNavigation;

	selected: boolean = false;
}
