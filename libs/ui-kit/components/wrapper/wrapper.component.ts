import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'ng-doc-wrapper',
	template: ` <ng-content></ng-content> `,
	styleUrls: ['./wrapper.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocWrapperComponent {}
