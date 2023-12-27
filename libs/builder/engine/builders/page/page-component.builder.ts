import { createImportPath, PAGE_NAME } from '@ng-doc/builder';
import { NgDocPage } from '@ng-doc/core';
import path from 'path';

import { editFileInRepoUrl, viewFileInRepoUrl } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, factory, FileOutput } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { apiBuilder } from './api.builder';
import { guideBuilder } from './guide.builder';

interface Config {
	context: NgDocBuilderContext;
	dir: string;
	page: NgDocPage;
	route: string;
	outDir: string;
	absoluteRoute: string;
}

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
export function pageComponentBuilder({
	context,
	dir,
	page,
	route,
	outDir,
	absoluteRoute,
}: Config): Builder<FileOutput> {
	const mdPath = path.join(dir, page.mdFile);
	const outPath = path.join(outDir, 'page.ts');

	return factory(
		[guideBuilder({ context, dir, absoluteRoute, mdPath, page }), apiBuilder(context, dir, page)],
		(guide: string, api: string) => ({
			filePath: outPath,
			content: renderTemplate('./page.ts.nunj', {
				context: {
					content: guide + api,
					routePrefix: context.config.routePrefix,
					page,
					entryImportPath: createImportPath(outDir, path.join(dir, PAGE_NAME)),
					editSourceFileUrl: context.config.repoConfig
						? editFileInRepoUrl(context.config.repoConfig, mdPath, route)
						: undefined,
					viewSourceFileUrl: context.config.repoConfig
						? viewFileInRepoUrl(context.config.repoConfig, mdPath)
						: undefined,
				},
			}),
		}),
	);
}
