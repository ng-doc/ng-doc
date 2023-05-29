import {NgIf} from '@angular/common';
import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {expandCollapseAnimation, preventInitialChildAnimations} from '@ng-doc/ui-kit/animations';
import {NgDocContent} from '@ng-doc/ui-kit/types';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

/** Component helps to expand or collapse content */
@Component({
    animations: [preventInitialChildAnimations, expandCollapseAnimation],
    selector: 'ng-doc-expander',
    templateUrl: './expander.component.html',
    styleUrls: ['./expander.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [NgIf, PolymorpheusModule],
})
export class NgDocExpanderComponent {
	/** Change expand state */
	@Input()
	expanded: boolean = false;

	/** Expander content */
	@Input()
	content: NgDocContent = '';

	/** Closed height could be used to show preview of the content */
	@Input()
	from: number = 0;

	@HostBinding('@preventInitialChild')
	preventInitialChild?: never;

	toggle(): void {
		this.expanded = !this.expanded;
	}
}
