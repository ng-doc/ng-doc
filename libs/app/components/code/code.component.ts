import {ChangeDetectionStrategy, Component, Input, OnInit} from '@angular/core';

@Component({
	selector: 'ng-doc-code',
	templateUrl: './code.component.html',
	styleUrls: ['./code.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocCodeComponent {
	@Input()
	code: string = '';

	@Input()
	language: string = 'html';
}
