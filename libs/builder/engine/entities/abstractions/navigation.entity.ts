import * as path from 'path';

import {capitalize, isCategoryEntity} from '../../../helpers';
import {GENERATED_MODULES_PATH} from '../../variables';
import {NgDocEntity} from './entity';
import {NgDocFileEntity} from './file.entity';

/**
 * Entity for file end points that generate modules and components.
 */
export abstract class NgDocNavigationEntity<T> extends NgDocFileEntity<T> {
	/**
	 * Indicates when current entity is using for page navigation.
	 */
	readonly isNavigable: boolean = true;

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

	abstract override parent?: NgDocNavigationEntity<unknown>;

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
			(child: NgDocEntity) => child instanceof NgDocNavigationEntity && child.isNavigable,
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

	get folderPath(): string {
		return path.join(this.parent?.folderPath ?? GENERATED_MODULES_PATH, this.route);
	}
}
