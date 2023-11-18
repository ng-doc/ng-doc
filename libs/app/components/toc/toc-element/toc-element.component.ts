import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input } from '@angular/core';

@Component({
	selector: 'li[ng-doc-toc-element]',
	templateUrl: './toc-element.component.html',
	styleUrls: ['./toc-element.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocTocElementComponent {
	@Input()
	href: string = '';

	@Input()
	@HostBinding('attr.data-ng-doc-selected')
	selected: boolean = false;

	@Input()
	@HostBinding('attr.data-ng-doc-level')
	level: number = 1;

	constructor(readonly elementRef: ElementRef<HTMLElement>) {}
}
