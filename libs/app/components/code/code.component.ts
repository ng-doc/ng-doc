import {Clipboard} from '@angular/cdk/clipboard';
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocNotifyService} from '@ng-doc/ui-kit';

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
	language: string = 'typescript';

	@Input()
	copyButton: boolean = true;

	constructor(private readonly notifyService: NgDocNotifyService, private readonly clipboard: Clipboard) {}

	copyCode(): void {
		this.clipboard.copy(this.code);
		this.notifyService.notify('Copied!');
	}
}
