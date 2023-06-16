import {NgIf} from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	HostBinding,
	Input
} from '@angular/core';
import {CopyButtonComponent} from '@ng-doc/app/components/copy-button';
import {NgDocSanitizeHtmlPipe} from '@ng-doc/app/pipes/sanitize-html';
import {NgDocLinkProcessorDirective} from '@ng-doc/app/processors/link-processor';
import {NgDocTooltipProcessorDirective} from '@ng-doc/app/processors/tooltip-processor';
import {NgDocTextComponent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-code',
	templateUrl: './code.component.html',
	styleUrls: ['./code.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgIf,
		NgDocTextComponent,
		NgDocSanitizeHtmlPipe,
		NgDocTooltipProcessorDirective,
		NgDocLinkProcessorDirective,
		CopyButtonComponent,
	],
})
export class NgDocCodeComponent implements AfterViewInit {
	@Input()
	html: string = '';

	@Input()
	copyButton: boolean = true;

	@Input()
	fileName?: string;

	@Input()
	lineNumbers: boolean = false;

	constructor(private elementRef: ElementRef<HTMLElement>, private changeDetectorRef: ChangeDetectorRef) {}

	@HostBinding('attr.data-ng-doc-has-header')
	get hasHeader(): boolean {
		return !!this.fileName;
	}

	get codeElement(): HTMLElement | null {
		return this.elementRef?.nativeElement.querySelector('code') ?? null;
	}

	ngAfterViewInit(): void {
		// We need to run change detection manually here, because we need to wait for the code to be rendered.
		this.changeDetectorRef.detectChanges();
	}
}
