import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, factory, FileOutput, whenDone } from '../../core';
import { PAGES_STORE } from '../../stores';
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
	return pageFileBuilder({ context, pagePath }).pipe(
		whenDone((page) => {
			PAGES_STORE.add(page.absoluteRoute(), page);

			return factory(
				[
					pageComponentBuilder({
						context,
						page,
					}),
					demoAssetsBuilder({ context, page }),
					playgroundBuilder({ page }),
				],
				(pageComponent, demoAssets, playgrounds) => {
					return [pageComponent, demoAssets, playgrounds];
				},
			);
		}),
	);
}
