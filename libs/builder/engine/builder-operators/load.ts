import {Observable, OperatorFunction} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {NgDocEntity} from '../entities/abstractions/entity';

/**
 * Operator that runs the `update` method of the entity.
 */
export function load(): OperatorFunction<NgDocEntity, NgDocEntity> {
	return (source: Observable<NgDocEntity>) => source.pipe(switchMap((e: NgDocEntity) => e.load().pipe(map(() => e))));
}
