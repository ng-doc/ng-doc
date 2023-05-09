import {getProjectTargetOptions} from '@angular/cdk/schematics';
import {JsonValue} from '@angular-devkit/core';
import {ProjectDefinition, WorkspaceDefinition} from '@angular-devkit/core/src/workspace';
import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {getWorkspace} from '@schematics/angular/utility/workspace';
import {
	addImports,
	addProviderToNgModule,
	ClassDeclaration,
	createProject,
	getMainModule,
	saveActiveProject,
	setActiveProject,
} from 'ng-morph';

import {Schema} from '../schema';
import {getProject} from '../utils/get-project';

/**
 *
 * @param options
 */
export function addSearchEngine(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		const logger = context.logger.createChild('add-search-engine');

		context.logger.info(`[INFO]: Search engine`);
		logger.info(`🔄 Adding default search engine...`);

		try {
			const workspace: WorkspaceDefinition = await getWorkspace(tree);
			const project: ProjectDefinition | undefined = getProject(options, workspace);

			if (!project) {
				logger.error(`❌ Target project not found. Please add search engine manually.`);

				return;
			}

			const buildOptions: Record<string, JsonValue | undefined> = getProjectTargetOptions(project, 'build');

			setActiveProject(createProject(tree, '/', ['**/*.ts', '**/*.json']));

			const mainModule: ClassDeclaration = getMainModule(buildOptions['main'] as string);

			addImports(mainModule.getSourceFile().getFilePath(), [{
				namedImports: ['provideSearchEngine', 'NgDocDefaultSearchEngine'],
				moduleSpecifier: '@ng-doc/app',
			}]);
			addProviderToNgModule(mainModule, 'provideSearchEngine(NgDocDefaultSearchEngine)', {unique: true});

			saveActiveProject();
			logger.info('✅ Done!');
		} catch (e) {
			logger.error(`❌ Error: ${e}`);
		}
	};
}
