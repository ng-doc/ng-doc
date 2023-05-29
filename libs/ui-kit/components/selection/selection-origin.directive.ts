import {Directive, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges} from '@angular/core';

import {NgDocSelectionHostDirective} from './selection-host.directive';

@Directive({
	selector: '[ngDocSelectionOrigin]',
	standalone: true,
})
export class NgDocSelectionOriginDirective implements OnChanges, OnDestroy {
	@Input('ngDocSelectionOrigin')
	selected: boolean = false;

	constructor(
		readonly elementRef: ElementRef<HTMLElement>,
		private readonly selectionHost: NgDocSelectionHostDirective,
	) {
		this.selectionHost.addOrigin(this);
	}

	ngOnChanges({selected}: SimpleChanges): void {
		if (selected) {
			this.selectionHost.changeSelected(this, this.selected);
		}
	}

	ngOnDestroy(): void {
		this.selectionHost.removeOrigin(this);
	}
}
