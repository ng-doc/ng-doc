import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input, OnChanges} from '@angular/core';
import {NgDocPosition} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-tab-selection',
	template: ``,
	styleUrls: ['./tab-selection.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabSelectionComponent implements OnChanges {
	@Input()
	bindTo: ElementRef<HTMLElement> | null = null;

	@Input()
	@HostBinding('attr.data-ng-doc-first')
	isItFirst: boolean = false;

	constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

	ngOnChanges(): void {
		if (this.bindTo) {
			this.setStyles(this.bindTo.nativeElement);
		}
	}

	private setStyles(element: HTMLElement): void {
		const position: NgDocPosition = this.getPosition(element);

		this.elementRef.nativeElement.style.left = position.left;
		this.elementRef.nativeElement.style.width = position.width;
	}

	private getPosition(element: HTMLElement): NgDocPosition {
		return {
			top: element ? `${element.offsetTop || 0}px` : '0',
			left: element ? `${element.offsetLeft || 0}px` : '0',
			width: element ? `${element.offsetWidth || 0}px` : '0',
			height: element ? `${element.offsetHeight || 0}px` : '0',
		};
	}
}
