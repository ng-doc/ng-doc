import { Rule, Tree } from '@angular-devkit/schematics';
import { updateWorkspace } from '@schematics/angular/utility/workspace';

/**
 *
 */
export function updateGitIgnore(): Rule {
	return async (tree: Tree) => {
		return updateWorkspace(() => {
			let gitignore: Buffer | null = tree.read('.gitignore');

			if (!gitignore) {
				return;
			}

			gitignore = Buffer.from(gitignore.toString().replace(/.ng-doc/g, '/ng-doc'));

			tree.overwrite('.gitignore', gitignore);
		});
	};
}
