import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'ng-doc-floated-border',
	template: ` <ng-content></ng-content> `,
	styleUrls: ['./floated-border.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocFloatedBorderComponent {}
