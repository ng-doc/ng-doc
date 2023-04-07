import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {updateWorkspace} from '@schematics/angular/utility/workspace';

/**
 *
 * @param options
 * @param context
 */
export function addGitIgnore(): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace(() => {
			const logger = context.logger.createChild('add-gitignore');

			context.logger.info(`[INFO]: Git ignore`);
			logger.info(`🔄 Adding ".ng-doc" folder to .gitignore file...`);

			try {
				const gitignore: Buffer | null = tree.read('.gitignore');

				if (!gitignore) {
					logger.warn(`⚠️ ".gitignore" file was not found, please add ".ng-doc" folder into it manually.`);

					return;
				}

				tree.overwrite('.gitignore', `${gitignore}\n\n# NgDoc files\n.ng-doc`);

				logger.info('✅ Done!');
			} catch (e) {
				logger.error(`❌ Error: ${e}`);
			}
		});
	};
}
