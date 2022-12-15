import {FileEntry, Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {updateWorkspace, WorkspaceDefinition} from '@schematics/angular/utility/workspace';

/**
 *
 * @param options
 * @param context
 */
export function addGitIgnore(): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			context.logger.info(`[INFO]: Adding .ng-doc folder to .gitignore...`);

			const gitignore: Buffer | null = tree.read('.gitignore');

			if (!gitignore) {
				context.logger.warn(`[WARNING]: .gitignore not found, please add ".ng-doc" folder into it manually.`);

				return;
			}

			tree.overwrite('.gitignore', `${gitignore}\n\n# NgDoc files\n.ng-doc`)
		});
	}
}
