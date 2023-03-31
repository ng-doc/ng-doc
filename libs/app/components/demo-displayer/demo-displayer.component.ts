import {Clipboard} from '@angular/cdk/clipboard';
import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocContent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-demo-displayer',
	templateUrl: './demo-displayer.component.html',
	styleUrls: ['./demo-displayer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoDisplayerComponent {
	@Input()
	codeContent: NgDocContent = '';

	@Input()
	code: string = '';

	@Input()
	language: string = 'typescript';

	@Input()
	container: boolean = true;

	@Input()
	@HostBinding('attr.data-ng-doc-border')
	border: boolean = true;

	@Input()
	expanded: boolean = false;

	copyTooltipText: string = '';

	constructor(private readonly clipboard: Clipboard) {}

	protected get expandTooltipText(): string {
		return this.expanded ? 'Collapse' : 'Expand';
	}

	copyCode(): void {
		this.clipboard.copy(this.code);
	}
}
