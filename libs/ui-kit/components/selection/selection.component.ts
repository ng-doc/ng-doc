import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input} from '@angular/core';
import {NgDocHorizontalAlign, NgDocPosition, NgDocVerticalAlign} from '@ng-doc/ui-kit/types';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';

import {NgDocSelectionHostDirective} from './selection-host.directive';

@Component({
	selector: 'ng-doc-selection',
	template: '',
	styleUrls: ['./selection.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
@UntilDestroy()
export class NgDocSelectionComponent implements AfterViewInit {
	@Input()
	@HostBinding('attr.data-ng-doc-align')
	align: NgDocHorizontalAlign | NgDocVerticalAlign = 'bottom';

	constructor(
		private readonly elementRef: ElementRef<HTMLElement>,
		private readonly selectionHost: NgDocSelectionHostDirective,
	) {}

	ngAfterViewInit(): void {
		this.selectionHost.selectedChange$
			.pipe(untilDestroyed(this))
			.subscribe((selected: HTMLElement | undefined) => this.setStyles(selected));
	}

	private setStyles(element?: HTMLElement): void {
		this.elementRef.nativeElement.style.visibility = 'hidden';
		if (element) {
			const position: NgDocPosition = this.getPosition(element);

			if (this.align === 'left' || this.align === 'right') {
				this.elementRef.nativeElement.style.top = position.top;
			} else {
				this.elementRef.nativeElement.style.left = position.left;
			}

			this.elementRef.nativeElement.style.height = position.height;
			this.elementRef.nativeElement.style.width = position.width;
			this.elementRef.nativeElement.style.visibility = 'visible';
		}
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
