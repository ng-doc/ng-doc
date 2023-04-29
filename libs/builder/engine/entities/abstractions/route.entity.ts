import {asArray, NgDocPageIndex} from '@ng-doc/core';
import * as path from 'path';

import {isRouteEntity, slash} from '../../../helpers';
import {NgDocModuleEntity} from './module.entity';

export abstract class NgDocRouteEntity<T = unknown> extends NgDocModuleEntity<T> {
	/**
	 * The route for the current entity.
	 */
	abstract route: string;

	/**
	 * The title of the current entity.
	 */
	abstract title: string;

	/**
	 * Keywords that will be used to create links to the current entity on the pages
	 */
	abstract keywords: string[];

	/**
	 * Url for to the source file to the current page, that can be used to open it in repository and edit
	 */
	get editSourceFileUrl(): string | undefined {
		return undefined;
	}

	/**
	 * Url for to the source file to the current page, that can be used to open it in repository and view
	 */
	get viewSourceFileUrl(): string | undefined {
		return undefined;
	}

	get fullRoute(): string {
		const parentRoute: string =
			this.parent instanceof NgDocRouteEntity ? this.parent.fullRoute : this.context.config.routePrefix ?? '';

		return slash(path.join('/', parentRoute, this.route));
	}

	/**
	 * Returns breadcrumbs for the current entity
	 */
	get breadcrumbs(): string[] {
		return isRouteEntity(this.parent) ? [...asArray(this?.parent?.breadcrumbs), this.title] : [this.title];
	}
}
