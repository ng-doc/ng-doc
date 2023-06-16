import {CommonModule} from '@angular/common';
import {Component, EventEmitter, Input, Output} from '@angular/core';
import {
	NgDocButtonIconComponent,
	NgDocIconComponent, NgDocLetDirective,
	NgDocSmoothResizeComponent,
	NgDocTooltipDirective
} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-expand-button',
	standalone: true,
	imports: [
		CommonModule,
		NgDocButtonIconComponent,
		NgDocIconComponent,
		NgDocSmoothResizeComponent,
		NgDocTooltipDirective,
		NgDocLetDirective,
	],
	templateUrl: './expand-button.component.html',
	styleUrls: ['./expand-button.component.scss'],
})
export class ExpandButtonComponent {
	@Input()
	expanded: boolean = false;

	@Output()
	expandedChange: EventEmitter<boolean> = new EventEmitter<boolean>();
}
