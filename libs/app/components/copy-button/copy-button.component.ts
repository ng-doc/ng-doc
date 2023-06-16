import {Clipboard} from '@angular/cdk/clipboard';
import {CommonModule} from '@angular/common';
import {Component, Input} from '@angular/core';
import {
	NgDocButtonIconComponent,
	NgDocIconComponent,
	NgDocSmoothResizeComponent,
	NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-copy-button',
	standalone: true,
	imports: [
		CommonModule,
		NgDocButtonIconComponent,
		NgDocIconComponent,
		NgDocSmoothResizeComponent,
		NgDocTooltipDirective,
	],
	templateUrl: './copy-button.component.html',
	styleUrls: ['./copy-button.component.scss'],
})
export class CopyButtonComponent {
	@Input()
	code: string = '';

	protected text: string = '';

	constructor(private readonly clipboard: Clipboard) {}

	copyCode(): void {
		this.clipboard.copy(this.code);
	}
}
