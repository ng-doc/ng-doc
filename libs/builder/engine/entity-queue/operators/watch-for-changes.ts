import {merge, MonoTypeOperatorFunction, Observable, of} from 'rxjs';
import {mapTo, mergeMap} from 'rxjs/operators';

import {NgDocEntity} from '../../entities/abstractions/entity';

/**
 *
 */
export function watchForChanges(): MonoTypeOperatorFunction<NgDocEntity> {
	return (source: Observable<NgDocEntity>) =>
		source.pipe(
			mergeMap((entity: NgDocEntity) => merge(of(entity), entity.dependencies.changes().pipe(mapTo(entity)))),
		);
}
