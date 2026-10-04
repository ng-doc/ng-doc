import { Directive, input, linkedSignal, output } from '@angular/core';

/**
 * Binds the checked state of a native checkbox: `true`, `false`, or `null` for the
 * indeterminate state. Use `[ngDocChecked]` and `(ngDocCheckedChange)`, or both at once with
 * `[(ngDocChecked)]`.
 */
@Directive({
  selector: 'input[ngDocChecked], input[ngDocCheckedChange]',
  host: {
    '[checked]': '!!state()',
    '[indeterminate]': 'state() === null',
    '(change)': 'onChange($event.target)',
  },
})
export class NgDocCheckedChangeDirective {
  // An input and a separate output rather than `model()`: the change event carries the user's
  // choice, which is never indeterminate, so it stays a `boolean`.
  /** Checked state; `null` shows the checkbox as indeterminate. */
  // eslint-disable-next-line @angular-eslint/prefer-signal-model
  readonly ngDocChecked = input<boolean | null>(false);

  /** Emits the new checked state when the user changes it. */
  readonly ngDocCheckedChange = output<boolean>();

  /** What the checkbox shows: the bound state until the user changes it. */
  protected readonly state = linkedSignal<boolean | null>(() => this.ngDocChecked());

  protected onChange(target: EventTarget | null): void {
    const checked: boolean = target instanceof HTMLInputElement ? target.checked : false;

    // The user's choice ends the indeterminate state, even when the bound value stays `null`.
    this.state.set(checked);
    this.ngDocCheckedChange.emit(checked);
  }
}
