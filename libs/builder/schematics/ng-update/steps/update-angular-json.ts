import {
	ProjectDefinition,
	TargetDefinition,
	updateWorkspace,
	WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';

import { getProject } from '../../utils';

/**
 *
 */
export function updateAngularJson() {
	return updateWorkspace((workspace: WorkspaceDefinition) => {
		const project: ProjectDefinition | undefined = getProject(workspace);

		if (!project) {
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

				if ('assets' in target.options) {
					const assets: Array<string | { input: string }> = target.options['assets'] as Array<
						string | { input: string }
					>;
					target.options['assets'] = assets.map((asset) => {
						if (
							asset &&
							typeof asset === 'object' &&
							'input' in asset &&
							(asset.input as string).startsWith('.ng-doc')
						) {
							return { ...asset, input: asset.input.replace('.ng-doc', 'ng-doc') };
						}

						return asset;
					});
				}
			}
		}
	});
}
