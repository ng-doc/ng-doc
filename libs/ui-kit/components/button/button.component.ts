import { ChangeDetectionStrategy, Component, HostBinding, Input, input } from '@angular/core';
import { NgDocColor, NgDocSize } from '@ng-doc/ui-kit/types';

@Component({
	selector:
		'button[ng-doc-button], a[ng-doc-button], button[ng-doc-button-flat], a[ng-doc-button-flat], button[ng-doc-button-text], a[ng-doc-button-text]',
	template: `<ng-content></ng-content>`,
	styleUrls: ['./button.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocButtonComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-size')
	size: NgDocSize = 'small';

	@Input()
	@HostBinding('attr.data-ng-doc-color')
	color: NgDocColor = 'primary';

	@Input()
	@HostBinding('attr.data-ng-doc-rounded')
	rounded: boolean = false;

	// eslint-disable-next-line @typescript-eslint/typedef
	signalInput = input<string>('signalInput');

	constructor() {
		console.log('signalInput', this.signalInput);
	}
}
