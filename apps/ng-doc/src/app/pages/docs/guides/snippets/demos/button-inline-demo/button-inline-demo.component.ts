import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocNotifyService} from '@ng-doc/ui-kit/services/notify';

@Component({
	selector: 'ng-doc-button-inline-demo',
	template: `
		<!-- NgDocHTMLSnippetStart(Button Template) -->
		<button ng-doc-button-flat color="orange" (click)="clickEvent()">Just a button</button>
		<!-- NgDocHTMLSnippetEnd(Button Template) -->
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonInlineDemoComponent {
	/* NgDocCodeSnippetStart(Constructor Block) */
	constructor(private readonly notifyService: NgDocNotifyService) {}

	/* NgDocCodeSnippetEnd(Constructor Block) */

	/* NgDocCodeSnippetStart(clickEvent) */
	clickEvent(): void {
		this.notifyService.notify('Button was clicked!');
	}

	/* NgDocCodeSnippetEnd(clickEvent) */
}
