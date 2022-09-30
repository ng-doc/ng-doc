import * as path from 'path';

import {NgDocModuleEntity} from './module.entity';
import {slash} from '../../../helpers';

export abstract class NgDocRouteEntity<T> extends NgDocModuleEntity<T> {
	/**
	 * The route for the current entity.
	 */
	abstract route: string;

	/**
	 * The title of the current entity.
	 */
	abstract title: string;

	get fullRoute(): string {
		const parentRoute: string = this.parent instanceof NgDocRouteEntity ? this.parent.fullRoute : '';

		return slash(path.join(parentRoute, this.route));
	}
}
