import {Observable, OperatorFunction} from 'rxjs';
import {mergeMap} from 'rxjs/operators';

import {NgDocBuiltOutput} from '../../../interfaces';
import {NgDocEntity} from '../../entities/abstractions/entity';

/**
 *
 */
export function buildEntity(): OperatorFunction<NgDocEntity, NgDocBuiltOutput[]> {
	return (source: Observable<NgDocEntity>) =>
		source.pipe(mergeMap((entity: NgDocEntity) => entity.buildArtifacts()))
}
