import {Observable, OperatorFunction} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {NgDocEntity} from '../entities/abstractions/entity';

/**
 *
 */
export function load(): OperatorFunction<NgDocEntity, NgDocEntity> {
	return (source: Observable<NgDocEntity>) => source.pipe(switchMap((e: NgDocEntity) => e.update().pipe(map(() => e))));
}
