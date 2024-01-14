import { createImportPath, PAGE_NAME } from '@ng-doc/builder';
import { NgDocPage, uid } from '@ng-doc/core';
import path from 'path';

import { editFileInRepoUrl, viewFileInRepoUrl } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, factory, FileOutput } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata } from '../interfaces';
import { apiBuilder } from './api.builder';
import { guideBuilder } from './guide.builder';

interface Config {
	context: NgDocBuilderContext;
	page: EntryMetadata<NgDocPage>;
}

export const PAGE_COMPONENT_BUILDER_TAG = 'PageComponent';

/**
 *
 * @param context.context
 * @param context
 * @param dir
 * @param page
 * @param context.dir
 * @param context.page
 * @param context.dirName
 * @param context.route
 * @param context.absoluteRoute
 * @param context.outDir
 */
export function pageComponentBuilder({ context, page }: Config): Builder<FileOutput> {
	const mdPath = path.join(page.dir, page.entry.mdFile);
	const outPath = path.join(page.outDir, 'page.ts');

	return factory(
		PAGE_COMPONENT_BUILDER_TAG,
		[guideBuilder({ context, mdPath, page }), apiBuilder(context, page)],
		(guide: string, api: string) => ({
			filePath: outPath,
			content: renderTemplate('./page.ts.nunj', {
				context: {
					id: uid(),
					content: guide + api,
					routePrefix: context.config.routePrefix,
					page: page.entry,
					entryImportPath: createImportPath(page.outDir, path.join(page.dir, PAGE_NAME)),
					editSourceFileUrl: context.config.repoConfig
						? editFileInRepoUrl(context.config.repoConfig, mdPath, page.route)
						: undefined,
					viewSourceFileUrl: context.config.repoConfig
						? viewFileInRepoUrl(context.config.repoConfig, mdPath)
						: undefined,
				},
			}),
		}),
	);
}
