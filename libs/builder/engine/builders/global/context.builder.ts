import { StructuredDoc } from '@ng-doc/builder';
import path from 'path';
import { of } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, runBuild } from '../../core';
import { renderTemplate } from '../../nunjucks';

export const CONTEXT_BUILDER_TAG = 'Context';

/**
 *
 * @param context
 * @param structuredDocs
 */
export function contextBuilder(
	context: NgDocBuilderContext,
	structuredDocs: StructuredDoc[],
): Builder<FileOutput> {
	const outPath = path.join(context.outBuildDir, 'context.ts');

	return of(null).pipe(
		runBuild(CONTEXT_BUILDER_TAG, async () => {
			return {
				filePath: outPath,
				content: renderTemplate('./context.ts.nunj', {
					context: {
						entries: structuredDocs,
					},
				}),
			};
		}),
	);
}
