import { Directive, input } from '@angular/core';

/**
 * Directive rotates host with transition
 */
@Directive({
  selector: '[ngDocRotator]',
  host: {
    '[style.transform]': 'transform()',
  },
})
export class NgDocRotatorDirective {
  /** Rotator state */
  readonly rotated = input<boolean>(false, { alias: 'ngDocRotator' });

  /** Start position angle */
  readonly from = input<number>(0);

  /** End position angle */
  readonly to = input<number>(90);

  protected transform(): string {
    return `rotateZ(${this.rotated() ? this.to() : this.from()}deg)`;
  }
}
