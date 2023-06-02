import {from, Observable, of, OperatorFunction} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {buildFileEntity, isSourceFileEntity} from '../../helpers';
import {NgDocEntity} from '../entities/abstractions/entity';

/**
 * Operator that compiles the source file only if it is a `NgDocSourceFileEntity`.
 *
 * @param tsConfig - The path to the TypeScript configuration file.
 * @param root - The root path of the project.
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
