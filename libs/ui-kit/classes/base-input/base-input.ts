import { Directive, DOCUMENT, ElementRef, inject } from '@angular/core';
import { DIControl, injectHostControl } from 'di-controls';
import { DIControlConfig } from 'di-controls/controls';
import { Subject } from 'rxjs';

/**
 * Base class of the directives that turn a native `input` into a UI Kit control
 * (`ngDocInputString`, `ngDocInputNumber`). Input wrappers and comboboxes query it to read the
 * state of their input.
 */
@Directive({
  host: {
    class: 'ng-doc-input',
  },
})
export abstract class NgDocBaseInput<T> extends DIControl<T> {
  override readonly elementRef: ElementRef<HTMLInputElement> = inject(ElementRef);

  /** Emits after the input updates its model from a user edit. */
  readonly changes: Subject<void> = new Subject();

  protected readonly document = inject(DOCUMENT);

  protected constructor(config?: DIControlConfig<T, T>) {
    super({
      host: injectHostControl({ optional: true }),
      ...config,
    });
  }

  /** Placeholder of the native input. */
  get placeholder(): string {
    return this.elementRef.nativeElement.placeholder || '';
  }

  /** Whether the native input has focus. */
  get isFocused(): boolean {
    return this.document.activeElement === this.elementRef.nativeElement;
  }

  /** Whether the native input is read-only. */
  get isReadonly(): boolean {
    return this.elementRef.nativeElement.readOnly;
  }

  /** Current text of the native input. */
  get value(): string {
    return this.elementRef.nativeElement.value;
  }

  /** Focuses the native input. */
  focus(): void {
    this.elementRef.nativeElement.focus();
  }

  /** Replays the `-blink` animation class on the native input. */
  blink(): void {
    this.renderer.removeClass(this.elementRef.nativeElement, '-blink');
    // Reading the layout restarts the CSS animation when the class is added again.
    this.elementRef.nativeElement.offsetWidth;
    this.renderer.addClass(this.elementRef.nativeElement, '-blink');
  }

  override updateModel(value: T | null) {
    super.updateModel(value);

    this.changes.next();
  }
}
