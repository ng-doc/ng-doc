import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgDocContent } from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-tab',
	template: '',
	styleUrls: ['./tab.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocTabComponent<T> {
	@Input()
	label: NgDocContent = '';

	@Input()
	id: T | number = 0;

	/** Expander content */
	@Input()
	content: NgDocContent = '';
}
