import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';

@Component({
	selector: 'ng-doc-kind-icon',
	template: '{{kind[0]}}',
	styleUrls: ['./kind-icon.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocKindIconComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-kind')
	kind: string = '';

	@Input()
	@HostBinding('attr.data-ng-doc-type')
	type: 'declaration' | 'type' = 'declaration';
}
