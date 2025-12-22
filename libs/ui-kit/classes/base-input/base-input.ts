import { Directive, DOCUMENT, ElementRef, HostBinding, inject } from '@angular/core';
import { DIControl, injectHostControl } from 'di-controls';
import { DIControlConfig } from 'di-controls/controls';
import { Subject } from 'rxjs';

@Directive()
export abstract class NgDocBaseInput<T> extends DIControl<T> {
  override readonly elementRef: ElementRef<HTMLInputElement> = inject(ElementRef);
  readonly changes: Subject<void> = new Subject();

  protected readonly document = inject(DOCUMENT);

  protected constructor(config?: DIControlConfig<T, T>) {
    super({
      host: injectHostControl({ optional: true }),
      ...config,
    });
  }

  @HostBinding('class')
  get hostClasses(): string {
    return 'ng-doc-input';
  }

  get placeholder(): string {
    return this.elementRef.nativeElement.placeholder || '';
  }

  get isFocused(): boolean {
    return this.document.activeElement === this.elementRef.nativeElement;
  }

  get isReadonly(): boolean {
    return this.elementRef.nativeElement.readOnly;
  }

  get value(): string {
    return this.elementRef.nativeElement.value;
  }

  focus(): void {
    this.elementRef.nativeElement.focus();
  }

  blink(): void {
    this.renderer.removeClass(this.elementRef.nativeElement, '-blink');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.elementRef.nativeElement.offsetWidth;
    this.renderer.addClass(this.elementRef.nativeElement, '-blink');
  }

  override updateModel(value: T | null) {
    super.updateModel(value);

    this.changes.next();
  }
}
