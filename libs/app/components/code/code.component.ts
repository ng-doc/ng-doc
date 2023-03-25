import {Clipboard} from '@angular/cdk/clipboard';
import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input} from '@angular/core';
import {NgDocNotifyService} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-code',
	templateUrl: './code.component.html',
	styleUrls: ['./code.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocCodeComponent {
	@Input()
	html: string = '';

	@Input()
	copyButton: boolean = true;

	@Input()
	fileName?: string;

	@Input()
	lineNumbers: boolean = false;

	constructor(
		private elementRef: ElementRef<HTMLElement>,
		private readonly notifyService: NgDocNotifyService,
		private readonly clipboard: Clipboard,
	) {}

	@HostBinding('attr.data-ng-doc-has-header')
	get hasHeader(): boolean {
		return !!this.fileName;
	}

	get codeElement(): HTMLElement | null {
		return this.elementRef?.nativeElement.querySelector('code') ?? null;
	}

	copyCode(): void {
		this.clipboard.copy(this.codeElement?.textContent ?? '');
		this.notifyService.notify('Copied!');
	}
}
