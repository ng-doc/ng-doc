import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import {
	ProjectDefinition,
	TargetDefinition,
	updateWorkspace,
	WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';

import { getProject } from '../utils';

/**
 *
 */
export function update(): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			const logger = context.logger.createChild('migrate-to-newest-version');

			context.logger.info(`[INFO]: Builders`);
			logger.info(`🔄 Replacing Angular CLI builders with @ng-doc builders...`);

			try {
				const project: ProjectDefinition | undefined = getProject(workspace);

				if (!project) {
					logger.error(`❌ Project that uses @ng-doc/builder was not found.`);

					return;
				}

				const buildTarget: TargetDefinition | undefined = project.targets.get('build');

				if (buildTarget) {
					buildTarget.builder = '@ng-doc/builder:application';

					if (buildTarget.options) {
						buildTarget.options['browser'] = buildTarget.options['main'];
						delete buildTarget.options['main'];

						if (buildTarget.options['polyfills']) {
							buildTarget.options['polyfills'] = [buildTarget.options['polyfills']];
						}
					}

					Object.keys(buildTarget.configurations ?? {}).forEach((key: string) => {
						if (buildTarget.configurations) {
							const configuration = buildTarget.configurations[key];

							if (configuration) {
								if ('buildOptimizer' in configuration) {
									delete configuration['buildOptimizer'];
								}

								if ('vendorChunk' in configuration) {
									delete configuration['vendorChunk'];
								}
							}
						}
					});
				}

				for (const target of project.targets.values()) {
					Object.keys(target.configurations ?? {}).forEach((key: string) => {
						if (target.configurations) {
							const configuration = target.configurations[key];

							if (configuration) {
								if ('browserTarget' in configuration) {
									configuration['buildTarget'] = configuration['browserTarget'];

									delete configuration['browserTarget'];
								}
							}
						}
					});

					if (target.options) {
						if ('browserTarget' in target.options) {
							target.options['buildTarget'] = target.options['browserTarget'];

							delete target.options['browserTarget'];
						}
					}
				}

				logger.info('✅ Done!');
			} catch (e) {
				logger.error(`❌ Error: ${e}`);
			}
		});
	};
}
