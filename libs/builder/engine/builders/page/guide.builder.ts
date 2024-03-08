import {
  createBuilder,
  createMainTrigger,
  createSecondaryTrigger,
  isBuilderError,
  onKeywordsTouch,
} from '@ng-doc/builder';
import { NgDocEntityAnchor, NgDocKeyword, NgDocPage } from '@ng-doc/core';
import { finalize, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { ObservableSet } from '../../../classes';
import { buildEntityKeyword, keywordKey } from '../../../helpers';
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

  const builder = of(void 0).pipe(
    runBuild(
      GUIDE_BUILDER_TAG,
      async () => {
        try {
          removeKeywords();
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

          return await sequentialJobs(content, [
            markdownToHtmlJob(page.dir, dependencies),
            processHtmlJob({
              headings: context.config.guide?.anchorHeadings,
              route: page.absoluteRoute(),
              addAnchor: anchors.push.bind(anchors),
            }),
            extractKeywordsJob({ addUsedKeyword: usedKeywords.add.bind(usedKeywords) }),
          ]);
        } catch (cause) {
          throw new Error(`Error while building guide page "${page.entry.title}"`, { cause });
        }
      },
      cacheStrategy,
    ),
  );

  return createBuilder(
    [
      createMainTrigger(watchFile(mdPath, 'update'), onDependenciesChange(dependencies)),
      createSecondaryTrigger(onKeywordsTouch(usedKeywords)),
    ],
    () => builder,
  ).pipe(
    tap((state) => {
      if (isBuilderError(state)) return;

      const keywords = getKeywords(page, anchors);

      if (keywords.length) {
        removeKeywords = keywordsStore.add(...keywords);
        touchKeywords(...keywords.map(([key]) => key));
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
