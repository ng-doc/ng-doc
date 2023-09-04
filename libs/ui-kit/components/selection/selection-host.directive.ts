import { Directive } from '@angular/core';
import { Observable, ReplaySubject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { NgDocSelectionOriginDirective } from './selection-origin.directive';

@Directive({
	selector: '[ngDocSelectionHost]',
	standalone: true,
})
export class NgDocSelectionHostDirective {
	private origins: Set<NgDocSelectionOriginDirective> = new Set<NgDocSelectionOriginDirective>();
	private selected?: NgDocSelectionOriginDirective;
	private selectedChange: ReplaySubject<HTMLElement | undefined> = new ReplaySubject<
		HTMLElement | undefined
	>();

	get selectedChange$(): Observable<HTMLElement | undefined> {
		return this.selectedChange.pipe(distinctUntilChanged());
	}

	addOrigin(origin: NgDocSelectionOriginDirective): void {
		this.origins.add(origin);
	}

	removeOrigin(origin: NgDocSelectionOriginDirective): void {
		this.origins.delete(origin);

		if (this.selected === origin) {
			this.changeSelected(origin, false);
		}
	}

	changeSelected(origin: NgDocSelectionOriginDirective, selected: boolean): void {
		this.selected =
			this.selected === origin || selected ? (selected ? origin : undefined) : this.selected;
		this.selectedChange.next(this.selected?.elementRef?.nativeElement ?? undefined);
	}
}
