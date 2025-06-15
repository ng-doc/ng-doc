import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
  Renderer2,
} from '@angular/core';

@Directive({
  selector: 'input[ngDocChecked], input[ngDocCheckedChange]',
  standalone: true,
})
export class NgDocCheckedChangeDirective {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  @Input()
  set ngDocChecked(checked: null | boolean) {
    this.updateProperty('checked', checked || false);
    this.updateProperty('indeterminate', checked === null);
  }

  @Output()
  readonly ngDocCheckedChange: EventEmitter<boolean> = new EventEmitter<boolean>();

  constructor() {
    this.updateProperty('checked', false);
  }

  @HostListener('change', ['$event.target'])
  onChange({ checked }: HTMLInputElement): void {
    this.updateProperty('indeterminate', false);
    this.ngDocCheckedChange.emit(checked);
  }

  private updateProperty(property: 'checked' | 'indeterminate', value: boolean): void {
    this.renderer.setProperty(this.element.nativeElement, property, value);
  }
}
