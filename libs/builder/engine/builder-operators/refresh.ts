import {Observable, of, OperatorFunction} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {isSourceFileEntity} from '../../helpers';
import {NgDocEntity} from '../entities/abstractions/entity';

/**
 * Operator that runs the `emit` method of the entity.
 */
export function refresh(): OperatorFunction<NgDocEntity, NgDocEntity> {
	return (source: Observable<NgDocEntity>) =>
		source.pipe(
			switchMap((e: NgDocEntity) => {
				if (isSourceFileEntity(e)) {
					return e.refresh().pipe(map(() => e));
				}

				return of(e);
			}),
		);
}
