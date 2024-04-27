import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
	selector: 'ng-doc-demo',
	standalone: true,
	imports: [CommonModule],
	template: `
		<!-- snippet "Test" -->
		<p>demo works!</p>
		123123 TAGNAME: {{ element?.tagName }} END
		<!-- snippet -->
	`,
	styles: [],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoComponent {
	@Input()
	element?: HTMLElement;

	method(): void {
		/* snippet "TypeScript" */
		console.log('demo');
		/* snippet */
	}
}
