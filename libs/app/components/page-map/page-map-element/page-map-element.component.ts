import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input} from '@angular/core';
import {marked} from 'marked';

@Component({
	selector: 'li[ng-doc-page-map-element]',
	templateUrl: './page-map-element.component.html',
	styleUrls: ['./page-map-element.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NgDocPageMapElementComponent {
	@Input()
	href: string = '';

	@Input()
	@HostBinding('attr.data-ng-doc-selected')
	selected: boolean = false;

	@Input()
	@HostBinding('attr.data-ng-doc-level')
	level: number = 1;

	constructor(
		readonly elementRef: ElementRef<HTMLElement>
	) {
	}
}
