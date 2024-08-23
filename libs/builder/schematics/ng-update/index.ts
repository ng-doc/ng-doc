import { chain, Rule } from '@angular-devkit/schematics';

import { updatePages } from './steps/update-pages';

/**
 *
 */
export function update(): Rule {
  return chain([updatePages()]);
}
