import {getProjectTargetOptions} from '@angular/cdk/schematics';
import {JsonValue} from '@angular/compiler-cli/ngcc/src/utils';
import {ProjectDefinition, WorkspaceDefinition} from '@angular-devkit/core/src/workspace';
import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {getWorkspace} from '@schematics/angular/utility/workspace';
import {
	addImportToNgModule,
	ClassDeclaration,
	createProject,
	getMainModule,
	saveActiveProject,
	setActiveProject,
} from 'ng-morph';

import {EntityImport, ImportModule, MAIN_MODULES} from '../constants/modules';
import {Schema} from '../schema';
import {addUniqueImport} from '../utils/add-unique-import';
import {getProject} from '../utils/get-project';

/**
 *
 * @param options
 */
export function addNgDocModules(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		const workspace: WorkspaceDefinition = await getWorkspace(tree);
		const project: ProjectDefinition | undefined = getProject(options, workspace);

		if (!project) {
			context.logger.warn('[WARNING]: Target project not found in current workspace');
			return;
		}

		const buildOptions: Record<string, JsonValue> = getProjectTargetOptions(project, 'build');

		setActiveProject(createProject(tree, '/', ['**/*.ts', '**/*.json']));

		const mainModule: ClassDeclaration = getMainModule(buildOptions['main'] as string);

		importMainModules(mainModule);

		saveActiveProject();
	};
}

/**
 *
 * @param mainModule
 */
function importMainModules(mainModule: ClassDeclaration): void {
	const mainModulePath: string = mainModule.getSourceFile().getFilePath();

	MAIN_MODULES.forEach((module: ImportModule) => {
		addImportToNgModule(mainModule, module.initializer, {unique: true});

		module.imports.forEach((moduleImport: EntityImport) => {
			addUniqueImport(mainModulePath, moduleImport.name, moduleImport.path);
		});
	});
}
