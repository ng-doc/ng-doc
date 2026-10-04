import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';

import { NgDocEngine } from '../schema';
import { KEEP_ANOTHER_BUILDER_URL } from '../utils/select-engine';

/**
 * Says what to do next.
 * @param engine - The engine that was set up.
 * @param keptBuilder - The project's own builder, when no NgDoc builder was set up.
 */
export function postInstall(engine: NgDocEngine, keptBuilder?: string): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    if (keptBuilder) {
      context.logger.info(
        `[INFO]: Everything is done except the builders: "${keptBuilder}" was kept. Generate the files for the "@ng-doc/generated" path with the "ng-doc" command, run "ng serve" through "ng-doc dev" and skip the NgDoc packages in a federation configuration, as described in ${KEEP_ANOTHER_BUILDER_URL}`,
      );

      return;
    }

    context.logger.info(
      `[INFO]: Everything is done! Files for the "@ng-doc/generated" path will be created when you start your application${
        engine === 'vite' ? ' with "ng serve" or build it with "ng build"' : ''
      }.`,
    );
  };
}
