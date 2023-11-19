import { chain, Rule } from '@angular-devkit/schematics';

import { updateAngularJson } from './steps/update-angular-json';

/**
 *
 */
export function update(): Rule {
	return chain([updateAngularJson()]);
}
