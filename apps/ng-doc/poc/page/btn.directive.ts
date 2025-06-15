import { ChangeDetectorRef, Directive, ElementRef, inject, Input, OnChanges } from '@angular/core';

@Directive({
  selector: '[ngDocBtn]',
  standalone: true,
})
export class BtnDirective implements OnChanges {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  /**
   * @link http://ng-doc.io/docs/guide/directives
   */
  @Input('ngDocBtn')
  text: string = '234';

  @Input()
  num: number = 123;

  @Input()
  checker: boolean = true;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    setTimeout(() => {
      this.changeDetectorRef.detectChanges();
    }, 100);
  }

  ngOnChanges(): void {
    this.element.nativeElement.innerHTML = this.text;
  }
}
