import { BlockScrollStrategy, ViewportRuler } from '@angular/cdk/overlay';
import { DOCUMENT, inject, Service } from '@angular/core';

/**
 * Blocks and unblocks the scrolling of the page, for example while a sidebar covers it.
 */
@Service()
export class NgDocScrollService {
  private readonly scrollStrategy: BlockScrollStrategy = new BlockScrollStrategy(
    inject(ViewportRuler),
    inject<Document>(DOCUMENT),
  );

  /**
   * Block global scroll
   */
  block(): void {
    this.scrollStrategy.enable();
  }

  /**
   * Unblock global scroll
   */
  unblock(): void {
    this.scrollStrategy.disable();
  }
}
