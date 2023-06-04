import {Observable, of, OperatorFunction} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {isSourceFileEntity} from '../../helpers';
import {errorHandler} from '../../operators/error-handler';
import {NgDocEntity} from '../entities/abstractions/entity';

/**
 * Operator that runs the `emit` method of the entity.
 */
export function refresh(): OperatorFunction<NgDocEntity, NgDocEntity> {
	return (source: Observable<NgDocEntity>) =>
		source.pipe(
			switchMap((e: NgDocEntity) => {
				if (isSourceFileEntity(e) && !e.destroyed) {
					return e.refresh().pipe(
						map(() => e),
						errorHandler(e),
					);
				}

				return of(e);
			}),
		);
}
