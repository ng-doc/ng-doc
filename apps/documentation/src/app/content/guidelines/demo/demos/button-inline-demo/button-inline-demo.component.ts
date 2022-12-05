import {Component} from '@angular/core';
import {NgDocNotifyService} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-button-inline-demo',
	template: `
		<!-- NgDocHTMLSnippetStart(Button Template) -->
		<button ng-doc-button (click)="clickEvent()">Just a button</button>
		<!-- NgDocHTMLSnippetEnd(Button Template) -->
	`,
})
export class ButtonInlineDemoComponent {
	/* NgDocCodeSnippetStart(Constructor) */
	constructor(private readonly notifyService: NgDocNotifyService) {}
	/* NgDocCodeSnippetEnd(Constructor) */

	/* NgDocCodeSnippetStart(ClickEvent) */
	clickEvent(): void {
		this.notifyService.notify('Button was clicked!');
	}
	/* NgDocCodeSnippetEnd(ClickEvent) */
}
