import {Clipboard} from '@angular/cdk/clipboard';
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocNotifyService} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-demo-displayer',
	templateUrl: './demo-displayer.component.html',
	styleUrls: ['./demo-displayer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoDisplayerComponent {
	@Input()
	code: string = '';

	@Input()
	language: string = 'typescript';

	@Input()
	container: boolean = true;

	expanded: boolean = false;

	constructor(private readonly notifyService: NgDocNotifyService, private readonly clipboard: Clipboard) {}

	copyCode(): void {
		this.clipboard.copy(this.code);
		this.notifyService.notify('Copied!');
	}
}
