import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

@Component({
	selector: 'ng-doc-tooltip-wrapper',
	template: `
		<div class="content-projection" [ngDocTooltip]="content">
			<ng-content></ng-content>
		</div>
	`,
	styles: [
		`
			.content-projection {
				display: unset;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTooltipWrapperComponent {
	@Input()
	content?: string;
}
