import * as minimatch from 'minimatch';
import * as path from 'path';
import {Observable, of} from 'rxjs';
import {mapTo, tap} from 'rxjs/operators';
import {SyntaxKind} from 'ts-morph';

import {capitalize, isCategoryEntity} from '../../../helpers';
import {CACHE_PATH, CATEGORY_PATTERN, GENERATED_MODULES_PATH} from '../../variables';
import {NgDocCategoryEntity} from '../category.entity';
import {NgDocEntity} from './entity';

/**
 * Entity for file end points that generate modules and components.
 */
export abstract class NgDocFileEntity<T> extends NgDocEntity {
	/**
	 * Indicates when current entity is using for page navigation.
	 */
	readonly isNavigable: boolean = true;

	/**
	 * Entity target.
	 */
	protected target?: T;

	/**
	 * The route for the current entity.
	 */
	abstract route: string;

	/**
	 * The title of the current entity.
	 */
	abstract title: string;

	/**
	 * Order is using for sorting pages and categories in sidebar
	 */
	abstract order?: number;

	/**
	 * File title of the module.
	 */
	abstract moduleFileName: string;

	/**
	 * The title of the module.
	 */
	abstract moduleName: string;

	override get storeKey(): string {
		return this.sourceFilePath;
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
	 * Returns is this category entity.
	 *
	 * @type {boolean}
	 */
	get isCategory(): boolean {
		return isCategoryEntity(this);
	}

	/**
	 * Returns paths to the module in generated folder
	 *
	 * @type {string}
	 */
	get modulePath(): string {
		return path.join(this.folderPath, this.moduleFileName);
	}

	/**
	 * Returns children of the current buildable that are using for page navigation
	 *
	 * @type {NgDocEntity[]}
	 */
	get navigationItems(): NgDocEntity[] {
		return this.childEntities.filter(
			(child: NgDocEntity) => child instanceof NgDocFileEntity && child.isNavigable,
		);
	}

	/**
	 * Returns relative paths to the module in generated folder that could be used for import
	 *
	 * @type {string}
	 */
	get moduleImport(): string {
		return path.relative(this.context.context.workspaceRoot, this.modulePath).replace(/.ts$/, '');
	}

	override get folderPath(): string {
		return path.join(this.parent?.folderPath ?? GENERATED_MODULES_PATH, this.route);
	}

	override init(): Observable<void> {
		return this.update();
	}

	protected override update(): Observable<void> {
		return of(null).pipe(
			tap(() => {
				this.sourceFile.refreshFromFileSystemSync();
				// Sync because async method works weird and runs this hook few times
				this.sourceFile.emitSync();

				const relativePath: string = path.relative(
					this.context.context.workspaceRoot,
					this.sourceFile.getFilePath(),
				);
				const pathToCompiled: string = path.join(CACHE_PATH, relativePath.replace(/\.ts$/, '.js'));

				delete require.cache[require.resolve(pathToCompiled)];
				this.target = require(pathToCompiled).default;

				if (!this.target) {
					throw new Error(
						`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have exported it as default.`,
					);
				}

				this.readyToBuild = true;
			}),
			mapTo(void 0),
		);
	}

	protected getParentFromCategory(): NgDocCategoryEntity | undefined {
		const sourceFilePath: string | undefined = this.getObjectExpressionFromDefault()
			?.getProperty('category')
			?.getChildrenOfKind(SyntaxKind.Identifier)
			?.pop()
			?.getDefinitions()[0]
			?.getSourceFile()
			?.getFilePath();

		if (sourceFilePath && minimatch(sourceFilePath, CATEGORY_PATTERN) && sourceFilePath !== this.sourceFilePath) {
			const parent: NgDocEntity | undefined = this.entityStore.get(
				path.relative(this.context.context.workspaceRoot, sourceFilePath),
			);

			return isCategoryEntity(parent) ? parent : undefined;
		}
		return undefined;
	}
}
