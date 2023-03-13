import {DOCUMENT} from '@angular/common';
import {Directive, EventEmitter, Inject, Input, NgZone, Output} from '@angular/core';
import {isKeyboardEvent} from '@ng-doc/core/helpers/is-keyboard-event';
import {objectKeys} from '@ng-doc/core/helpers/object-keys';
import {ngDocZoneOptimize} from '@ng-doc/ui-kit/observables';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {fromEvent, Observable} from 'rxjs';
import {filter, share} from 'rxjs/operators';

const KEYUP_EVENT: Observable<Event> = fromEvent(document, 'keyup').pipe(share());

@Directive({
	selector: '[ngDocHotkey]',
})
@UntilDestroy()
export class NgDocHotkeyDirective {
	@Input('ngDocHotkey')
	hotkey?: Partial<KeyboardEvent>;

	@Output('ngDocHotkey')
	callback: EventEmitter<void> = new EventEmitter<void>();

	constructor(
		@Inject(DOCUMENT)
		private readonly document: Document,
		private readonly ngZone: NgZone,
	) {
		KEYUP_EVENT.pipe(
			filter(isKeyboardEvent),
			filter((event: KeyboardEvent) =>
				objectKeys(this.hotkey ?? {}).every(
					(key: keyof KeyboardEvent) => this.hotkey && this.hotkey[key] === event[key],
				),
			),
			filter((event: KeyboardEvent) => {
				if (event.target instanceof HTMLElement) {
					return !['input', 'textarea', 'select'].includes(event.target.tagName.toLowerCase());
				}
				return true;
			}),
			ngDocZoneOptimize(this.ngZone),
			untilDestroyed(this),
		).subscribe((event: KeyboardEvent) => {
			event.preventDefault();
			this.callback.emit();
		});
	}
}
