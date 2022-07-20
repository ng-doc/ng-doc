import {NgDocModuleEntity} from './module.entity';

export abstract class NgDocRouteEntity<T> extends NgDocModuleEntity<T> {
	/**
	 * The route for the current entity.
	 */
	abstract route: string;

	/**
	 * The title of the current entity.
	 */
	abstract title: string;
}
