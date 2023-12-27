import { NgDocEntityAnchor, NgDocPage } from '@ng-doc/core';
import { merge } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { ObservableSet } from '../../../classes';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, runBuild, sequentialJobs, watchFile } from '../../core';
import { onDependenciesChange } from '../../core/triggers/on-dependencies-change';
import { renderTemplate } from '../../nunjucks';
import { markdownToHtmlJob, postProcessHtmlJob, processHtmlJob } from '../shared';

interface Config {
	context: NgDocBuilderContext;
	dir: string;
	absoluteRoute: string;
	mdPath: string;
	page: NgDocPage;
}

/**
 *
 * @param context.context
 * @param context
 * @param dir
 * @param page
 * @param context.dir
 * @param context.route
 * @param context.page
 * @param context.mdPath
 * @param context.absoluteRoute
 */
export function guideBuilder({
	context,
	dir,
	absoluteRoute,
	mdPath,
	page,
}: Config): Builder<string> {
	const dependencies = new ObservableSet<string>();
	const anchors = [] as NgDocEntityAnchor[];
	const potentialKeywords = new Set<string>();
	const usedKeywords = new Set<string>();

	return merge(watchFile(mdPath), onDependenciesChange(dependencies)).pipe(
		startWith(void 0),
		runBuild(async () => {
			try {
				dependencies.clear();
				potentialKeywords.clear();
				usedKeywords.clear();

				const content = renderTemplate(page.mdFile, {
					scope: dir,
					context: {
						NgDocPage: page,
						NgDocActions: undefined,
					},
					dependencies,
					filters: false,
				});

				return sequentialJobs(content, [
					markdownToHtmlJob(dir, dependencies),
					processHtmlJob({
						headings: context.config.guide?.anchorHeadings,
						route: absoluteRoute,
						addAnchor: anchors.push.bind(anchors),
					}),
					postProcessHtmlJob({
						addPotentialKeyword: potentialKeywords.add.bind(potentialKeywords),
						addUsedKeyword: usedKeywords.add.bind(usedKeywords),
					}),
				]);
			} catch (e) {
				throw new Error(`Error while building guide page "${page.title}"`, { cause: e });
			}
		}),
	);
}
