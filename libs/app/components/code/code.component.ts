import {Clipboard} from '@angular/cdk/clipboard';
import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input, ViewChild} from '@angular/core';
import {NgDocNotifyService} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-code',
	templateUrl: './code.component.html',
	styleUrls: ['./code.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocCodeComponent{
	@Input()
	code: string = '';

	@Input()
	html: string = '';

	@Input()
	language: string = 'typescript';

	@Input()
	copyButton: boolean = true;

	@Input()
	@HostBinding('attr.data-ng-doc-standalone')
	standalone: boolean = true;

	@ViewChild('codeContainer', {static: true, read: ElementRef})
	codeContainer?: ElementRef<HTMLElement>;

	constructor(private readonly notifyService: NgDocNotifyService, private readonly clipboard: Clipboard) {}

	copyCode(): void {
		this.clipboard.copy(this.codeContainer?.nativeElement.textContent ?? 'Error :(');
		this.notifyService.notify('Copied!');
	}
}

