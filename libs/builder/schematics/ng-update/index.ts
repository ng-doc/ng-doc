import { chain, Rule } from '@angular-devkit/schematics';

import { updateAngularJson } from './steps/update-angular-json';
import { updateGitIgnore } from './steps/update-git-ignore';
import { updateTsConfig } from './steps/update-ts-config';

/**
 *
 */
export function update(): Rule {
	return chain([updateAngularJson(), updateGitIgnore(), updateTsConfig]);
}
