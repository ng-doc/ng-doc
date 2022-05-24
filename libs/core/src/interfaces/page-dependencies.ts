import {Type} from '@angular/core';

/**
 * A map of dependencies that should be used in a demo page.
 */
export interface NgDocPageDependencies {
  /** The page demo components */
  demo?: Record<string, Type<unknown>>;
  /** The page modules */
  module?: Type<unknown>;
}
