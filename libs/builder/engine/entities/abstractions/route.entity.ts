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

	get fullRoute(): string {
		const parentRoute: string = this.parent instanceof NgDocRouteEntity ? this.parent.fullRoute : '';

		return slash(path.join('/', parentRoute, this.route));
	}
}
