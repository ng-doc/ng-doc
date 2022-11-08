import {MonoTypeOperatorFunction, Observable} from 'rxjs';
import {tap} from 'rxjs/operators';

import {NgDocEntity} from '../../entities/abstractions/entity';

/**
 *
 */
export function updateSourceFile(): MonoTypeOperatorFunction<NgDocEntity> {
	return (source: Observable<NgDocEntity>) =>
		source.pipe(tap((entity: NgDocEntity) => entity.sourceFile.refreshFromFileSystemSync()))
};
