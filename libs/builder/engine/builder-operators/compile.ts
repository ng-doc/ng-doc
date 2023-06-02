import {from, Observable, of, OperatorFunction} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {buildFileEntity, isSourceFileEntity} from '../../helpers';
import {NgDocEntity} from '../entities/abstractions/entity';

/**
 *
 * @param tsConfig
 * @param root
 */
export function compile(tsConfig: string, root: string): OperatorFunction<NgDocEntity, NgDocEntity> {
	return (source: Observable<NgDocEntity>) =>
		source.pipe(
			switchMap((e: NgDocEntity) => {
				if (isSourceFileEntity(e)) {
					return from(buildFileEntity(e.sourceFile, tsConfig, root)).pipe(map(() => e));
				}

				return of(e);
			}),
		);
}
