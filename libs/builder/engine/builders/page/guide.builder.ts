import { IndexStore, onKeywordsTouch } from '@ng-doc/builder';
import { NgDocEntityAnchor, NgDocKeyword, NgDocPage } from '@ng-doc/core';
import { finalize, merge } from 'rxjs';
import { debounceTime, startWith, tap } from 'rxjs/operators';

import { ObservableSet } from '../../../classes';
import { buildEntityKeyword, keywordKey } from '../../../helpers';
import { buildIndexes } from '../../../helpers/build-indexes';
import { NgDocBuilderContext } from '../../../interfaces';
import {
  Builder,
  CacheStrategy,
  keywordsStore,
  runBuild,
  sequentialJobs,
  touchKeywords,
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

interface CacheData {
  dependencies: string[];
  anchors: NgDocEntityAnchor[];
  usedKeywords: string[];
}

export const GUIDE_BUILDER_TAG = 'Guide';

/**
 *
 * @param config
 */
export function guideBuilder(config: Config): Builder<string> {
  const { context, mdPath, page } = config;
  const dependencies = new ObservableSet<string>();
  const anchors = [] as NgDocEntityAnchor[];
  const usedKeywords = new Set<string>();
  let removeKeywords: () => void = () => {};
  let removeIndexes: () => void = () => {};

  const cacheStrategy = {
    id: `${mdPath}#Guide`,
    action: 'restore',
    files: () => [page.path, mdPath, ...dependencies.asArray()],
    getData: () => ({
      dependencies: dependencies.asArray(),
      anchors,
      usedKeywords: Array.from(usedKeywords),
    }),
    onCacheLoad: (data) => {
      dependencies.add(...data.dependencies);
      anchors.push(...data.anchors);
      data.usedKeywords.forEach(usedKeywords.add.bind(usedKeywords));
    },
    toCache: (content) => content,
    fromCache: (content) => content,
  } satisfies CacheStrategy<CacheData, string>;

  return merge(
    watchFile(mdPath),
    onDependenciesChange(dependencies),
    onKeywordsTouch(usedKeywords),
  ).pipe(
    debounceTime(0),
    startWith(void 0),
    runBuild(
      GUIDE_BUILDER_TAG,
      async () => {
        try {
          removeKeywords();
          removeIndexes();
          anchors.length = 0;
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

          const proccessedContent = await sequentialJobs(content, [
            markdownToHtmlJob(page.dir, dependencies),
            processHtmlJob({
              headings: context.config.guide?.anchorHeadings,
              route: page.absoluteRoute(),
              addAnchor: anchors.push.bind(anchors),
            }),
            extractKeywordsJob({ addUsedKeyword: usedKeywords.add.bind(usedKeywords) }),
          ]);

          removeIndexes = IndexStore.add(
            ...(await buildIndexes({
              content: proccessedContent,
              title: page.entry.title,
              breadcrumbs: page.breadcrumbs(),
              pageType: 'guide',
              route: page.absoluteRoute(),
            })),
          );

          return proccessedContent;
        } catch (cause) {
          throw new Error(`Error while building guide page "${page.entry.title}"`, { cause });
        }
      },
      cacheStrategy,
    ),
    tap(() => {
      const keywords = getKeywords(page, anchors);

      if (keywords.length) {
        removeKeywords = keywordsStore.add(...keywords);
        touchKeywords(...keywords.map(([key]) => key));
      }
    }),
    finalize(() => {
      removeKeywords();
      removeIndexes();
    }),
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
