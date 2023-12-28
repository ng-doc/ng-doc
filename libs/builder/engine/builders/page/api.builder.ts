import { NgDocPage } from '@ng-doc/core';
import path from 'path';
import { merge } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, runBuild, watchFile } from '../../core';
import { EntryMetadata } from '../interfaces';

/**
 *
 * @param context
 * @param dir
 * @param page
 */
export function apiBuilder(
	context: NgDocBuilderContext,
	page: EntryMetadata<NgDocPage>,
): Builder<string> {
	const mdPath = path.join(page.dir, page.entry.mdFile);

	return merge(watchFile(mdPath)).pipe(
		startWith(void 0),
		runBuild(async () => {
			return '';
		}),
	);
}
