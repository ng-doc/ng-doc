import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'ng-doc-demo',
	standalone: true,
	imports: [CommonModule],
	template: `
		<!-- snippet "Test" -->
		<p>demo works!</p>
		123123
		<!-- snippet -->
	`,
	styles: [],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoComponent {
	constructor() {}

	method(): void {
		/* snippet "TypeScript" */
		console.log('demo');
		/* snippet */
	}
}
