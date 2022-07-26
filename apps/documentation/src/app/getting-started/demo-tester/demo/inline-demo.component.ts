import {ChangeDetectionStrategy, Component, HostBinding, Input, OnInit} from '@angular/core';

type Alias = 'one' | 'two' | 34 | true;

/* NgDocCodeSnippetStart(Test1) */
@Component({
	selector: '[ng-doc-inline-demo], ng-doc-inline, p[ng-doc-inline]',
	template: `
		<p [style.color]="color">
			inline-demo works 34234!
			<ng-content></ng-content>
		</p>
		{{ count }}
	`,
	styles: [
		`
			:host[data-momo='false'] {
				background-color: black;
			}
		`,
	],
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
	alias2: Alias = true;

	@Input()
	@HostBinding('attr.data-momo')
	momo: boolean = true;

	@Input()
	nomomo: boolean = true;

	/* NgDocCodeSnippetStart(ONINIT) */
	ngOnInit(): void {
		console.log('inline-demo works!');
	}

	/* NgDocCodeSnippetEnd(ONINIT) */
}
/* NgDocCodeSnippetEnd(Test2) */
