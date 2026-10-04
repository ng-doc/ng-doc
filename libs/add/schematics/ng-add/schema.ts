/** The NgDoc engine that `ng add` sets up. */
export type NgDocEngine = 'vite' | 'legacy';

export interface Schema {
  readonly project: string;
  /**
   * `vite` (the Vite engine) or `legacy` (the legacy builders). Without it, a standalone
   * application gets the Vite engine, and an NgModule application or a project that already uses
   * NgDoc keeps or gets the legacy builders.
   */
  readonly engine?: NgDocEngine;
}
