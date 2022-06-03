import * as minimatch from 'minimatch';
import * as path from 'path';
import {EMPTY, from, Observable, of} from 'rxjs';
import {first, map, mapTo} from 'rxjs/operators';
import {SyntaxKind} from 'ts-morph';

import {capitalize, isCategoryPoint} from '../../helpers';
import {CACHE_PATH, CATEGORY_PATTERN, GENERATED_MODULES_PATH} from '../variables';
import {NgDocBuildable} from './buildable';
import {NgDocCategoryPoint} from './category';
import {NgDocPagePoint} from './page';
import {NgDocPageDependenciesPoint} from './page-dependencies';

type Parent = NgDocCategoryPoint;
type Child = NgDocCategoryPoint | NgDocPagePoint | NgDocPageDependenciesPoint;

/**
 * Buildables for angular end points that generate modules and components.
 */
export abstract class NgDocAngularBuildable<T, P extends Parent, C extends Child> extends NgDocBuildable<P, C> {
	readonly isNavigationItem: boolean = true;
	/**
	 * Compiled source file.
	 */
	protected compiled?: T;

	/**
	 * The route for the current buildable.
	 */
	abstract route: string;

	/**
	 * The title of the current buildable.
	 */
	abstract title: string;

	/**
	 * The scope that using to resolve files in the templates.
	 */
	abstract scope: string;

	/**
	 * File title of the module.
	 */
	abstract moduleFileName: string;

	/**
	 * The title of the module.
	 */
	abstract moduleName: string;

	/**
	 * Returns full url from the root
	 *
	 * @type {string}
	 */
	get url(): string {
		return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
	}

	/**
	 * Returns title based on the route.
	 *
	 * @type {string}
	 */
	get name(): string {
		return capitalize(this.route);
	}

	/**
	 * Returns paths to the module in generated folder
	 *
	 * @type {string}
	 */
	get modulePathInGenerated(): string {
		return path.join(this.folderPathInGenerated, this.moduleFileName);
	}

	/**
	 * Returns relative paths to the module in generated folder that could be used for import
	 *
	 * @type {string}
	 */
	get moduleImportPath(): string {
		return path.relative(this.context.context.workspaceRoot, this.modulePathInGenerated).replace(/.ts$/, '');
	}

	get folderPathInGenerated(): string {
		return path.join(this.parent?.folderPathInGenerated ?? GENERATED_MODULES_PATH, this.route);
	}

	// eslint-disable-next-line @TypeScript-eslint/ban-ts-comment
	// @ts-ignore
	get parent(): NgDocCategoryPoint | undefined {
		const sourceFilePath: string | undefined = this.getObjectExpressionFromDefault()
			?.getProperty('category')
			?.getChildrenOfKind(SyntaxKind.Identifier)
			?.pop()
			?.getDefinitions()[0]
			?.getSourceFile()
			?.getFilePath();

		if (sourceFilePath && minimatch(sourceFilePath, CATEGORY_PATTERN) && sourceFilePath !== this.sourceFilePath) {
			const parent: NgDocBuildable<Parent, Child> | undefined = this.buildables.get(
				path.relative(this.context.context.workspaceRoot, sourceFilePath),
			);

			return isCategoryPoint(parent) ? parent : undefined;
		}
		return undefined;
	}

	override emit(): Observable<void> {
		return from(this.sourceFile.emit()).pipe(mapTo(void 0));
	}

	override update(): void {
		const relativePath: string = path.relative(this.context.context.workspaceRoot, this.sourceFile.getFilePath());
		const pathToCompiled: string = path.join(CACHE_PATH, relativePath.replace(/\.ts$/, '.js'));

		delete require.cache[require.resolve(pathToCompiled)];
		this.compiled = require(pathToCompiled).default;

		if (!this.compiled) {
			throw new Error(
				`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have exported it as default.`,
			);
		}

		if (!this.title) {
			throw new Error(
				`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have a title property.`,
			);
		}

		this.readyToBuild = true;
	}
}
