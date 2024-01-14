import { merge } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, whenDone } from '../../core';
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
export function pageBuilder(context: NgDocBuilderContext, pagePath: string): Builder<FileOutput> {
	return pageFileBuilder({ context, pagePath }).pipe(
		whenDone((page) => {
			return merge(
				pageComponentBuilder({
					context,
					page,
				}),
				demoAssetsBuilder({ context, page }),
				playgroundBuilder({ page }),
			);
		}),
	);
}
