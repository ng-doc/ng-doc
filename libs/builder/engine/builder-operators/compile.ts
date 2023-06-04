import {Observable, of, OperatorFunction} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {isFileEntity} from '../../helpers';
import {errorHandler} from '../../operators/error-handler';
import {NgDocEntity} from '../entities/abstractions/entity';

/**
 * Operator that compiles the source file only if it is a `NgDocFileEntity`
 */
export function compile(): OperatorFunction<NgDocEntity, NgDocEntity> {
	return (source: Observable<NgDocEntity>) =>
		source.pipe(
			switchMap((e: NgDocEntity) => {
				if (isFileEntity(e) && e.isReadyForBuild) {
					return e.compile().pipe(
						map(() => e),
						errorHandler(e),
					);
				}

				return of(e);
			}),
		);
}
