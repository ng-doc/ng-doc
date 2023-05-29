import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {RouterLink, RouterLinkActive} from '@angular/router';
import {NgDocNavigation} from '@ng-doc/app/interfaces';
import {NgDocDotComponent, NgDocTextComponent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-sidebar-item',
	templateUrl: './sidebar-item.component.html',
	styleUrls: ['./sidebar-item.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [RouterLinkActive, RouterLink, NgDocDotComponent, NgDocTextComponent],
})
export class NgDocSidebarItemComponent {
	@Input()
	item?: NgDocNavigation;
}
