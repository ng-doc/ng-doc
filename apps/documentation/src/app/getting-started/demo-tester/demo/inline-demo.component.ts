import {ChangeDetectionStrategy, Component, Input, OnInit} from '@angular/core';

type Alias = 'one' | 'two';

/* NgDocCodeSnippetStart(Test1) */
@Component({
	selector: 'ng-doc-inline-demo',
	template: ` <p [style.color]="color">inline-demo works 34234!</p> {{count}} `,
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

	@Input()
	alias: 'one' | 'two' = 'one';

	@Input()
	alias2: Alias = 'one';

	/* NgDocCodeSnippetStart(ONINIT) */
	ngOnInit(): void {
		console.log('inline-demo works!');
	}

	/* NgDocCodeSnippetEnd(ONINIT) */
}
/* NgDocCodeSnippetEnd(Test2) */
