import {Directive} from '@angular/core';
import {Observable, ReplaySubject} from 'rxjs';
import {distinctUntilChanged} from 'rxjs/operators';

import {NgDocSelectionOriginDirective} from './selection-origin.directive';

@Directive({
	selector: '[ngDocSelectionHost]',
})
export class NgDocSelectionHostDirective {
	private origins: Set<NgDocSelectionOriginDirective> = new Set<NgDocSelectionOriginDirective>();
	private selected?: NgDocSelectionOriginDirective;
	private selectedChange: ReplaySubject<HTMLElement | undefined> = new ReplaySubject<HTMLElement | undefined>();

	get selectedChange$(): Observable<HTMLElement | undefined> {
		return this.selectedChange.pipe(distinctUntilChanged());
	}

	addOrigin(origin: NgDocSelectionOriginDirective): void {
		this.origins.add(origin);
	}

	removeOrigin(origin: NgDocSelectionOriginDirective): void {
		this.origins.delete(origin);

		this.changeSelected(origin, this.selected !== origin);
	}

	changeSelected(origin: NgDocSelectionOriginDirective, selected: boolean): void {
		this.selected = this.selected === origin || selected ? (selected ? origin : undefined) : undefined;
		this.selectedChange.next(this.selected?.elementRef?.nativeElement ?? undefined);
	}
}
