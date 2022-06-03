import {Component, OnInit} from '@angular/core';

/* NgDocCodeSnippetStart(Test1) */
@Component({
	selector: 'ng-doc-inline-demo',
	template: ` <p style="color: red">inline-demo works 234!</p> `,
	styles: [],
})
/* NgDocCodeSnippetEnd(Test1) */
/* NgDocCodeSnippetStart(Test2) */
export class InlineDemoComponent implements OnInit {
	constructor() {}

	/* NgDocCodeSnippetStart(ONINIT) */
	ngOnInit(): void {
		console.log('inline-demo works!');
	}
	/* NgDocCodeSnippetEnd(ONINIT) */
}
/* NgDocCodeSnippetEnd(Test2) */
