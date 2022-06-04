import {Clipboard} from '@angular/cdk/clipboard';
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

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

	@Input()
	copyButton: boolean = true;

	constructor(private readonly clipboard: Clipboard) {}

	copyCode(): void {
		this.clipboard.copy(this.code);
	}
}
