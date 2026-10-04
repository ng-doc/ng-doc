import {
  afterNextRender,
  DestroyRef,
  Directive,
  DOCUMENT,
  inject,
  input,
  NgZone,
  output,
  untracked,
} from '@angular/core';
import { objectKeys } from '@ng-doc/core/helpers/object-keys';

/** Elements where a key types text instead of running a hotkey. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Emits when a key that matches the given keyboard event properties is released anywhere in the
 * document, except while the reader types in a field.
 * @example
 * <button [ngDocHotkey]="{ key: 'k', ctrlKey: true }" (ngDocHotkey)="open()">Open</button>
 */
@Directive({
  selector: '[ngDocHotkey]',
})
export class NgDocHotkeyDirective {
  /** The keyboard event properties to match, for example the key and the modifier keys. */
  readonly hotkey = input<Partial<KeyboardEvent>>(undefined, { alias: 'ngDocHotkey' });

  /** Emits when the hotkey is released. */
  readonly callback = output<void>({ alias: 'ngDocHotkey' });

  constructor() {
    const document = inject(DOCUMENT);
    const ngZone = inject(NgZone);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const listener = (event: KeyboardEvent) => {
        if (!this.matches(event)) {
          return;
        }

        event.preventDefault();
        // The listener runs outside the zone, so zone.js applications get change detection only
        // when the hotkey matches.
        ngZone.run(() => this.callback.emit());
      };

      ngZone.runOutsideAngular(() => document.addEventListener('keyup', listener));
      destroyRef.onDestroy(() => document.removeEventListener('keyup', listener));
    });
  }

  private matches(event: KeyboardEvent): boolean {
    const hotkey = untracked(this.hotkey) ?? {};
    const target = event.composedPath?.()[0] ?? event.target;

    return (
      objectKeys(hotkey).every((key: keyof KeyboardEvent) => hotkey[key] === event[key]) &&
      !(target instanceof Element && target.closest(TEXT_ENTRY))
    );
  }
}
