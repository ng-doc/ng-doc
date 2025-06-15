import {
  afterNextRender,
  DestroyRef,
  Directive,
  EventEmitter,
  inject,
  Input,
  NgZone,
  Output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isKeyboardEvent } from '@ng-doc/core/helpers/is-keyboard-event';
import { objectKeys } from '@ng-doc/core/helpers/object-keys';
import { ngDocZoneOptimize } from '@ng-doc/ui-kit/observables';
import { fromEvent } from 'rxjs';
import { filter } from 'rxjs/operators';

@Directive({
  selector: '[ngDocHotkey]',
  standalone: true,
})
export class NgDocHotkeyDirective {
  private readonly ngZone = inject(NgZone);

  @Input('ngDocHotkey')
  hotkey?: Partial<KeyboardEvent>;

  @Output('ngDocHotkey')
  callback: EventEmitter<void> = new EventEmitter<void>();

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      fromEvent(document, 'keyup')
        .pipe(
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
          takeUntilDestroyed(destroyRef),
        )
        .subscribe((event: KeyboardEvent) => {
          event.preventDefault();
          this.callback.emit();
        });
    });
  }
}
