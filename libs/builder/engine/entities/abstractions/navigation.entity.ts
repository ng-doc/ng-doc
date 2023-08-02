import {isCategoryEntity} from '../../../helpers';
import {NgDocEntity} from './entity';
import {NgDocRouteEntity} from './route.entity';

/**
 * Entity for pages that are using for navigation in the sidebar.
 */
export abstract class NgDocNavigationEntity<TTarget> extends NgDocRouteEntity<TTarget> {
	/**
	 * Indicates when current entity is using for page navigation.
	 */
	readonly isNavigable: boolean = true;

	/**
	 * Order is using for sorting pages and categories in sidebar
	 */
	abstract order?: number;

	abstract override parent?: NgDocNavigationEntity<unknown>;

	override get folderName(): string {
		return this.route;
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
	 * Returns children of the current buildable that are using for page navigation
	 *
	 * @type {NgDocEntity[]}
	 */
	get navigationItems(): NgDocEntity[] {
		return this.builtChildren.filter(
			(child: NgDocEntity) => child instanceof NgDocNavigationEntity && child.isNavigable,
		);
	}
}
