import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';

/* NgDocCodeSnippetStart(Test1) */
@Component({
	selector: 'ng-doc-inline-demo',
	template: ` <p style="color: red">inline-demo works 234!</p> `,
	styles: [],
	changeDetection: ChangeDetectionStrategy.OnPush
})
/* NgDocCodeSnippetEnd(Test1) */
/* NgDocCodeSnippetStart(Test2) */
export class InlineDemoComponent implements OnInit {
	/* NgDocCodeSnippetStart(ONINIT) */
	ngOnInit(): void {
		console.log('inline-demo works!');
	}
	/* NgDocCodeSnippetEnd(ONINIT) */
}
/* NgDocCodeSnippetEnd(Test2) */
