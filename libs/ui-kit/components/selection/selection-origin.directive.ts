import {
  Directive,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';

import { NgDocSelectionHostDirective } from './selection-host.directive';

@Directive({
  selector: '[ngDocSelectionOrigin]',
  standalone: true,
})
export class NgDocSelectionOriginDirective implements OnChanges, OnDestroy {
  readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly selectionHost = inject(NgDocSelectionHostDirective);

  @Input('ngDocSelectionOrigin')
  selected: boolean = false;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    this.selectionHost.addOrigin(this);
  }

  ngOnChanges({ selected }: SimpleChanges): void {
    if (selected) {
      this.selectionHost.changeSelected(this, this.selected);
    }
  }

  ngOnDestroy(): void {
    this.selectionHost.removeOrigin(this);
  }
}
