import { BlockScrollStrategy, ViewportRuler } from '@angular/cdk/overlay';
import { DOCUMENT, inject, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class NgDocScrollService {
  private readonly document = inject<Document>(DOCUMENT);
  private readonly viewportRuler = inject(ViewportRuler);

  private readonly scrollStrategy: BlockScrollStrategy;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    this.scrollStrategy = new BlockScrollStrategy(this.viewportRuler, this.document);
  }

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
