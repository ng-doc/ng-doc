import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocContent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-navbar',
	templateUrl: './navbar.component.html',
	styleUrls: ['./navbar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocNavbarComponent {
	@Input()
	leftContent: NgDocContent = '';

	@Input()
	centerContent: NgDocContent = '';

	@Input()
	rightContent: NgDocContent = '';

	@Input()
	search: boolean = true;
}
