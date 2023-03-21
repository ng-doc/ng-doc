import {NgDocPageSectionIndex} from '@ng-doc/core';
import * as path from 'path';

import {slash} from '../../../helpers';
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
	 * List of keywords that are used by the entity
	 * (they will be sat by Keywords Processor, and used to indicate when this entity should be re-build if one of them appears)
	 */
	usedKeywords: Set<string> = new Set<string>();

	/**
	 * List of indexes that should be sat by Indexes Processor based on html artifacts of the current entity
	 */
	indexes: NgDocPageSectionIndex[] = [];

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
}
