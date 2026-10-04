import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';

import { NgDocEngine } from '../schema';

/**
 * Says what to do next.
 * @param engine - The engine that was set up.
 */
export function postInstall(engine: NgDocEngine): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    context.logger.info(
      `[INFO]: Everything is done! Files for the "@ng-doc/generated" path will be created when you start your application${
        engine === 'vite' ? ' with "ng serve" or build it with "ng build"' : ''
      }.`,
    );
  };
}
