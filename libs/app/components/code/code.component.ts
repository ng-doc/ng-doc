import { Clipboard } from '@angular/cdk/clipboard';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input } from '@angular/core';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes/sanitize-html';
import { NgDocPageProcessorDirective } from '@ng-doc/app/processors/page-processor';
import {
	NgDocButtonIconComponent,
	NgDocIconComponent,
	NgDocSmoothResizeComponent,
	NgDocTextComponent,
	NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-code',
	templateUrl: './code.component.html',
	styleUrls: ['./code.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgIf,
		NgDocTextComponent,
		NgDocButtonIconComponent,
		NgDocTooltipDirective,
		NgDocSmoothResizeComponent,
		NgDocIconComponent,
		NgDocSanitizeHtmlPipe,
		NgDocPageProcessorDirective,
	],
})
export class NgDocCodeComponent {
	@Input()
	html: string = '';

	@Input()
	copyButton: boolean = true;

	@Input()
	name?: string;

	@Input()
	icon?: string;

	@Input()
	lineNumbers: boolean = false;

	tooltipText: string = '';

	constructor(private elementRef: ElementRef<HTMLElement>, private readonly clipboard: Clipboard) {}

	@HostBinding('attr.data-ng-doc-has-header')
	get hasHeader(): boolean {
		return !!this.name || !!this.icon;
	}

	get codeElement(): HTMLElement | null {
		return this.elementRef?.nativeElement.querySelector('code') ?? null;
	}

	copyCode(): void {
		this.clipboard.copy(this.codeElement?.textContent ?? '');
	}
}
