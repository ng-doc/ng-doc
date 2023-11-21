import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';

/**
 *
 */
export function postInstall(): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		context.logger.info(
			`[INFO]: Everything is done! Files for the "@ng-doc/generated" path will be created when you start your application.`,
		);
	};
}
