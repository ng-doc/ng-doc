import { StructuredDoc } from '@ng-doc/builder';
import path from 'path';
import { of } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, runBuild } from '../../core';
import { renderTemplate } from '../../nunjucks';

export const ROUTES_BUILDER_TAG = 'Routes';

/**
 *
 * @param context
 * @param structuredDocs
 */
export function routesBuilder(
	context: NgDocBuilderContext,
	structuredDocs: StructuredDoc[],
): Builder<FileOutput> {
	const outPath = path.join(context.outBuildDir, 'routes.ts');

	return of(null).pipe(
		runBuild(ROUTES_BUILDER_TAG, async () => {
			return {
				filePath: outPath,
				content: renderTemplate('./routes.ts.nunj', {
					context: {
						entries: structuredDocs,
						curDir: context.outBuildDir,
					},
				}),
			};
		}),
	);
}
