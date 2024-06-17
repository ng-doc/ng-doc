import { Directive, HostBinding, Input } from '@angular/core';

/**
 * Directive rotates host with transition
 * @alpha Documentation is in alpha state
 */
@Directive({
  selector: '[ngDocRotator]',
  standalone: true,
})
export class NgDocRotatorDirective {
  /** Rotator state */
  @Input('ngDocRotator')
  rotated: boolean = false;

  /** Start position angle */
  @Input()
  from: number = 0;

  /** End position anle */
  @Input()
  to: number = 90;

  @HostBinding('style.transform')
  get transform(): string {
    return `rotateZ(${this.rotated ? this.to : this.from}deg)`;
  }
}
