import {ChangeDetectionStrategy, Component, Input, OnInit} from '@angular/core';

/* NgDocCodeSnippetStart(Test1) */
@Component({
	selector: 'ng-doc-inline-demo',
	template: ` <p [style.color]="color">inline-demo works 234! {{ count }}</p> `,
	styles: [],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
/* NgDocCodeSnippetEnd(Test1) */
/* NgDocCodeSnippetStart(Test2) */
export class InlineDemoComponent implements OnInit {
	/** Color property */
	@Input()
	color: string = 'red';

	/** Count property */
	@Input()
	count: number = 0;

	/* NgDocCodeSnippetStart(ONINIT) */
	ngOnInit(): void {
		console.log('inline-demo works!');
	}

	/* NgDocCodeSnippetEnd(ONINIT) */
}
/* NgDocCodeSnippetEnd(Test2) */
