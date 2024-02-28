import { NgDocEntityAnchor, NgDocKeyword, NgDocPage } from '@ng-doc/core';
import { finalize, merge } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { ObservableSet } from '../../../classes';
import { buildEntityKeyword, keywordKey } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import {
  Builder,
  keywordsStore,
  onKeywordsChange,
  runBuild,
  sequentialJobs,
  triggerKeywordsChange,
  watchFile,
} from '../../core';
import { onDependenciesChange } from '../../core/triggers/on-dependencies-change';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata } from '../interfaces';
import { extractKeywordsJob, markdownToHtmlJob, processHtmlJob } from '../shared';

interface Config {
  context: NgDocBuilderContext;
  mdPath: string;
  page: EntryMetadata<NgDocPage>;
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
export function guideBuilder({ context, mdPath, page }: Config): Builder<string> {
  const dependencies = new ObservableSet<string>();
  const anchors = [] as NgDocEntityAnchor[];
  const usedKeywords = new Set<string>();
  let removeKeywords: () => void = () => {};

  return merge(
    watchFile(mdPath),
    onDependenciesChange(dependencies),
    onKeywordsChange(usedKeywords),
  ).pipe(
    startWith(void 0),
    runBuild('Guide', async () => {
      try {
        removeKeywords();
        dependencies.clear();
        usedKeywords.clear();

        const content = renderTemplate(page.entry.mdFile, {
          scope: page.dir,
          context: {
            NgDocPage: page,
            NgDocActions: undefined,
          },
          dependencies,
          filters: false,
        });

        const processedContent = await sequentialJobs(content, [
          markdownToHtmlJob(page.dir, dependencies),
          processHtmlJob({
            headings: context.config.guide?.anchorHeadings,
            route: page.absoluteRoute(),
            addAnchor: anchors.push.bind(anchors),
          }),
          extractKeywordsJob({ addUsedKeyword: usedKeywords.add.bind(usedKeywords) }),
        ]);

        const keywords = getKeywords(page, anchors);

        if (keywords.length) {
          removeKeywords = keywordsStore.add(...keywords);
          triggerKeywordsChange(...keywords.map(([key]) => key));
        }

        return processedContent;
      } catch (cause) {
        throw new Error(`Error while building guide page "${page.entry.title}"`, { cause });
      }
    }),
    finalize(removeKeywords),
  );
}

/**
 *
 * @param page
 * @param anchors
 */
function getKeywords(
  page: EntryMetadata<NgDocPage>,
  anchors: NgDocEntityAnchor[],
): Array<[string, NgDocKeyword]> {
  if (!page.entry.keyword) return [];

  const key = `*${page.entry.keyword}`;
  const rootKeyword: NgDocKeyword = {
    title: page.entry.title,
    path: page.absoluteRoute(),
    type: 'guide',
  };

  return [
    [keywordKey(key), rootKeyword],
    ...anchors.map((anchor) => {
      const entityKeyword = buildEntityKeyword(key, page.entry.title, page.absoluteRoute(), anchor);

      return [
        keywordKey(entityKeyword.key),
        {
          title: entityKeyword.title,
          path: entityKeyword.path,
          type: 'guide',
        } satisfies NgDocKeyword,
      ] satisfies [string, NgDocKeyword];
    }),
  ];
}
