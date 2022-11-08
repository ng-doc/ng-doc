import {MonoTypeOperatorFunction, Observable} from 'rxjs';
import {mapTo, mergeMap} from 'rxjs/operators';

import {NgDocEntity} from '../../entities/abstractions/entity';

/**
 *
 */
export function updateEntity(): MonoTypeOperatorFunction<NgDocEntity> {
	return (source: Observable<NgDocEntity>) =>
		source.pipe(mergeMap((entity: NgDocEntity) => entity.update().pipe(mapTo(entity))))
}
