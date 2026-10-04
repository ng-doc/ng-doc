import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { updateWorkspace } from '@schematics/angular/utility/workspace';

/**
 * Adds the generated `ng-doc` folder to `.gitignore` unless it is already ignored.
 */
export function addGitIgnore(): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    return updateWorkspace(() => {
      const logger = context.logger.createChild('add-gitignore');

      context.logger.info(`[INFO]: Git ignore`);
      logger.info(`🔄 Adding "ng-doc" folder to .gitignore file...`);

      try {
        const gitignore: Buffer | null = tree.read('.gitignore');

        if (!gitignore) {
          logger.warn(
            `⚠️ ".gitignore" file was not found, please add "/ng-doc" folder into it manually.`,
          );

          return;
        }

        // A second `ng add` run must not append the entry again.
        const ignored: boolean = gitignore
          .toString()
          .split(/\r?\n/)
          .some((line: string) => /^\/?ng-doc\/?$/.test(line.trim()));

        if (!ignored) {
          tree.overwrite('.gitignore', `${gitignore}\n\n# NgDoc files\n/ng-doc`);
        }

        logger.info('✅ Done!');
      } catch (e) {
        logger.error(`❌ Error: ${e}`);
      }
    });
  };
}
