import {Observable, OperatorFunction} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {NgDocEntity} from '../entities/abstractions/entity';

/**
 * Operator that runs the `emit` method of the entity.
 */
export function refresh(): OperatorFunction<NgDocEntity, NgDocEntity> {
	return (source: Observable<NgDocEntity>) =>
		source.pipe(switchMap((e: NgDocEntity) => e.refresh().pipe(map(() => e))));
}
