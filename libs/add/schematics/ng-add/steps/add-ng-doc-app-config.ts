import { getProjectTargetOptions } from '@angular/cdk/schematics';
import { JsonValue } from '@angular-devkit/core';
import { ProjectDefinition, WorkspaceDefinition } from '@angular-devkit/core/src/workspace';
import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { getWorkspace } from '@schematics/angular/utility/workspace';
import {
	addImportToNgModule,
	ClassDeclaration,
	createProject,
	getMainModule,
	saveActiveProject,
	setActiveProject,
} from 'ng-morph';

import { EntityImport, ImportModule, MAIN_MODULES } from '../constants/modules';
import { Schema } from '../schema';
import { addUniqueImport } from '../utils/add-unique-import';
import { getProject } from '../utils/get-project';

/**
 *
 * @param options
 */
export function addNgDocAppConfig(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		const logger = context.logger.createChild('add-ng-doc-app-config');

		context.logger.info(`[INFO]: NgDoc App configuration`);
		logger.info(`🔄 Integrating NgDoc to the project...`);

		try {
			const workspace: WorkspaceDefinition = await getWorkspace(tree);
			const project: ProjectDefinition | undefined = getProject(options, workspace);

			if (!project) {
				logger.error(`❌ Target project not found. Please configure your application manually.`);

				return;
			}

			const buildOptions: Record<string, JsonValue | undefined> = getProjectTargetOptions(
				project,
				'build',
			);

			setActiveProject(createProject(tree, '/', ['**/*.ts', '**/*.json']));

			const mainModule: ClassDeclaration = getMainModule(buildOptions['main'] as string);

			importMainModules(mainModule);
			saveActiveProject();

			logger.info('✅ Done!');
		} catch (e) {
			logger.error(`❌ Error: ${e}`);
		}
	};
}

/**
 *
 * @param mainModule
 */
function importMainModules(mainModule: ClassDeclaration): void {
	const mainModulePath: string = mainModule.getSourceFile().getFilePath();

	MAIN_MODULES.forEach((module: ImportModule) => {
		addImportToNgModule(mainModule, module.initializer, { unique: true });

		module.imports.forEach((moduleImport: EntityImport) => {
			addUniqueImport(mainModulePath, moduleImport.name, moduleImport.path);
		});
	});
}
