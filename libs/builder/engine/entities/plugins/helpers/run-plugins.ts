import {Observable, of, switchMap} from 'rxjs';
import {catchError} from 'rxjs/operators';

import {NgDocEntity} from '../../abstractions/entity';
import {NgDocEntityPlugin} from '../types';

/**
 *
 * @param data
 * @param entity
 * @param plugins
 */
export function runPlugins<T, TEntity extends NgDocEntity>(
	data: T,
	entity: TEntity,
	plugins: Array<NgDocEntityPlugin<T>>,
): Observable<T> {
	return plugins.reduce(
		(acc, plugin) =>
			acc.pipe(
				switchMap((data) => plugin.implementation(data, entity)),
				catchError((e: unknown) => {
					throw new Error(`Error while applying plugin "${plugin.id}" to entity "${entity.id}": ${e}`);
				}),
			),
		of(data),
	);
}
