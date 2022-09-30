import {chain, Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {NodePackageInstallTask} from '@angular-devkit/schematics/tasks';
import {addPackageJsonDependency, createProject, setActiveProject} from 'ng-morph';

import {NG_DOC_VERSION} from './constants/version';
import {Schema} from './schema';
import {addLayout} from './steps/add-layout';
import {addNgDocModules} from './steps/add-ng-doc-modules';
import {addStyles} from './steps/add-styles';
import {replaceBuilders} from './steps/replace-builders';

/**
 *
 * @param options
 */
export function ngAdd(options: Schema): Rule {
	return (tree: Tree, context: SchematicContext) => {
		setActiveProject(createProject(tree, '/', ['**/*.ts', '**/*.json']));

		addPackageJsonDependency(tree, {name: `@ng-doc/builder`, version: NG_DOC_VERSION});
		addPackageJsonDependency(tree, {name: `@ng-doc/ui-kit`, version: NG_DOC_VERSION});
		addPackageJsonDependency(tree, {name: `@ng-doc/core`, version: NG_DOC_VERSION});

		context.addTask(new NodePackageInstallTask(), []);

		return chain([
			replaceBuilders(options, context),
			addStyles(options, context),
			addNgDocModules(options),
			addLayout(options),
		]);
	};
}
