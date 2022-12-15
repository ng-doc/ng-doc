import {chain, Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {NodePackageInstallTask, RunSchematicTask} from '@angular-devkit/schematics/tasks';
import {addPackageJsonDependency, createProject, removePackageJsonDependency, setActiveProject} from 'ng-morph';

import {NG_DOC_VERSION} from './constants/version';
import {Schema} from './schema';
import {addAssets} from './steps/add-assets';
import {addGitIgnore} from './steps/add-git-ignore';
import {addLayout} from './steps/add-layout';
import {addNgDocModules} from './steps/add-ng-doc-modules';
import {addStyles} from './steps/add-styles';
import {addTsconfigPaths} from './steps/add-tsconfig-paths';
import {replaceBuilders} from './steps/replace-builders';

/**
 *
 * @param options
 */
export function ngAdd(options: Schema): Rule {
	return (tree: Tree, context: SchematicContext) => {
		setActiveProject(createProject(tree, '/', ['**/*.ts', '**/*.json']));

		addPackageJsonDependency(tree, {name: `@ng-doc/app`, version: NG_DOC_VERSION});
		addPackageJsonDependency(tree, {name: `@ng-doc/builder`, version: NG_DOC_VERSION});
		addPackageJsonDependency(tree, {name: `@ng-doc/ui-kit`, version: NG_DOC_VERSION});
		addPackageJsonDependency(tree, {name: `@ng-doc/core`, version: NG_DOC_VERSION});
		removePackageJsonDependency(tree, '@ng-doc/add');

		context.addTask(new NodePackageInstallTask(), [
			context.addTask(new RunSchematicTask('ng-add-setup-project', options)),
		]);
	};
}

/**
 *
 * @param options
 */
export function ngAddSetupProject(options: Schema): Rule {
	return chain([
		replaceBuilders(options),
		addStyles(options),
		addAssets(options),
		addNgDocModules(options),
		addLayout(options),
		addTsconfigPaths(options),
		addGitIgnore()
	]);
}
