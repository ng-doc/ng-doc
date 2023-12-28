import {
	emitFileOutput,
	getStructuredDocs,
	pageBuilder,
	PAGES_STORE,
	whenStackIsEmpty,
} from '@ng-doc/builder';
import { sync } from 'fast-glob';
import { minimatch } from 'minimatch';
import path from 'path';
import { merge, mergeMap, Observable } from 'rxjs';
import { debounceTime, filter, map, startWith, tap } from 'rxjs/operators';

import { NgDocBuilderContext } from '../interfaces';
import { watchFolder } from './core';
import { PAGE_PATTERN } from './variables';

/**
 *
 * @param context
 */
export function newBuild(context: NgDocBuilderContext): Observable<void> {
	const entries = sync(path.join(context.docsPath, PAGE_PATTERN));
	let count = 0;
	console.time('build');

	return watchFolder(context.docsPath, 'create').pipe(
		map((events) =>
			events.map((event) => event.path).filter((filePath) => minimatch(filePath, PAGE_PATTERN)),
		),
		filter((events) => events.length > 0),
		startWith(entries),
		mergeMap((paths) =>
			merge(...paths.map((filePath) => pageBuilder(context, path.resolve(filePath)))).pipe(
				tap((output) => console.log('preStack', output.state)),
				whenStackIsEmpty(),
				emitFileOutput(),
				tap((output) => console.log(count++, output)),
				map(() => void 0),
			),
		),
		debounceTime(0),
		tap(() => {
			const structure = getStructuredDocs(PAGES_STORE.asArray());

			console.timeEnd('build');
			console.log('structure', structure);
		}),
		filter(() => false),
	);
}
