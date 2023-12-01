import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
	selector: 'ng-doc-demo',
	standalone: true,
	imports: [CommonModule],
	template: `
		<!-- snippet "Test" -->
		{{ myInput }}
		<p>demo works!</p>
		123123
		<!-- snippet -->
	`,
	styles: [],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoComponent {
	val: string = '123';
	@Input()
	get myInput(): string {
		return this.val;
	}

	set myInput(value: string) {
		this.val = value;
	}

	method(): void {
		/* snippet "TypeScript" */
		console.log('demo');
		/* snippet */
	}
}
