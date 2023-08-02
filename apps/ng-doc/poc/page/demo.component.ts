import {CommonModule} from '@angular/common';
import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'ng-doc-demo',
	standalone: true,
	imports: [CommonModule],
	template: `
		<!-- NgDocHTMLSnippetStart(HTML) -->
		<p>demo works!</p>
		<!-- NgDocHTMLSnippetEnd(HTML) -->
	`,
	styles: [],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoComponent {
	method(): void {
		/* NgDocCodeSnippetStart(TypeScript) */
		console.log('demo');
		/* NgDocCodeSnippetEnd(TypeScript) */
	}
}
