import { emitFileOutput, entriesEmitter, isBuilderDone, whenStackIsEmpty } from '@ng-doc/builder';
import { merge, Observable } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';

import { NgDocBuilderContext } from '../interfaces';
import { globalBuilders } from './builders/global';

/**
 *
 * @param context
 */
export function newBuild(context: NgDocBuilderContext): Observable<void> {
	let count = 0;
	console.time('build');

	return merge(entriesEmitter(context), globalBuilders(context)).pipe(
		tap((output) => {
			// @ts-expect-error develop
			console.log('preStack', output.tag, output.state, output.result?.filePath);
			if (output.state === 'error') {
				console.error(output.error);
			}
		}),
		whenStackIsEmpty(),
		emitFileOutput(),
		tap((output) =>
			console.log(
				count++,
				output.state,
				isBuilderDone(output) ? output.result.filePath : output.error,
			),
		),
		map(() => void 0),
		debounceTime(0),
		tap(() => {
			console.timeEnd('build');
		}),
		// filter(() => false),
	);
}
