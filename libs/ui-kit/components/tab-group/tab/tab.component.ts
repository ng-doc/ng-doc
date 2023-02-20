import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocContent} from '@ng-doc/ui-kit/types';
import {PolymorpheusContent} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-tab',
	template: '',
	styleUrls: ['./tab.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
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
