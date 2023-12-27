import path from 'path';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, factory, FileOutput, whenDone } from '../../core';
import { createAbsoluteRoute, getEntryRoute } from '../helpers';
import { demoAssetsBuilder } from './demo-assets.builder';
import { pageComponentBuilder } from './page-component.builder';
import { pageFileBuilder } from './page-file.builder';
import { playgroundBuilder } from './playground.builder';

/**
 *
 * @param context
 * @param path
 * @param pagePath
 */
export function pageBuilder(context: NgDocBuilderContext, pagePath: string): Builder<FileOutput[]> {
	const dir = path.dirname(pagePath);
	const dirName = path.basename(dir);
	const relativePath = path.relative(context.docsPath, dir);
	const outDir = path.join(context.outGuidesDir, relativePath);

	return pageFileBuilder({ context, pagePath }).pipe(
		whenDone(({ page, sourceFile, objectExpression }) => {
			const route = getEntryRoute(page) ?? dirName;
			const absoluteRoute = createAbsoluteRoute(page, sourceFile);

			return factory(
				[
					pageComponentBuilder({
						context,
						dir,
						route,
						outDir,
						absoluteRoute,
						page,
					}),
					demoAssetsBuilder({ context, objectExpression, outDir }),
					playgroundBuilder({ objectExpression, page, dir, outDir }),
				],
				(pageComponent, demoAssets, playgrounds) => {
					return [pageComponent, demoAssets, playgrounds];
				},
			);
		}),
	);
}
