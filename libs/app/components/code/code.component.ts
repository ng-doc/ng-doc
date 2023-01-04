import {Clipboard} from '@angular/cdk/clipboard';
import {Element} from '@angular/compiler';
import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input, ViewChild} from '@angular/core';
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
	@HostBinding('attr.data-ng-doc-standalone')
	standalone: boolean = true;

	@ViewChild('htmlContainer', {read: ElementRef})
	htmlContainer?: ElementRef<HTMLElement>;

	@ViewChild('contentContainer', {read: ElementRef})
	contentContainer?: ElementRef<HTMLElement>;

	constructor(
		private elementRef: ElementRef<HTMLElement>,
		private readonly notifyService: NgDocNotifyService,
		private readonly clipboard: Clipboard,
	) {}

	copyCode(): void {
		this.clipboard.copy(this.elementRef.nativeElement.querySelector('code')?.textContent ?? 'Error :(');
		this.notifyService.notify('Copied!');
	}
}
