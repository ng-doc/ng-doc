import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {PolymorpheusContent} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-tab',
	template: '',
	styleUrls: ['./tab.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTabComponent<T> {
	@Input()
	label: PolymorpheusContent = '';

	@Input()
	id: T | number = 0;

	/** Expander content */
	@Input()
	content: PolymorpheusContent = '';
}
