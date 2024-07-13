import {
  ContentEntry,
  createBuilder,
  createMainTrigger,
  createSecondaryTrigger,
  isBuilderDone,
  onKeywordsTouch,
} from '@ng-doc/builder';
import { NgDocKeyword, NgDocPageAnchor } from '@ng-doc/core';
import { finalize, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { ObservableSet } from '../../../classes';
import { UTILS } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import {
  Builder,
  CacheStrategy,
  keywordsStore,
  runBuild,
  touchKeywords,
  watchFile,
} from '../../core';
import { onDependenciesChange } from '../../core/triggers/on-dependencies-change';
import { EntryMetadata } from '../interfaces';

interface Config {
  tag: string;
  context: NgDocBuilderContext;
  mainFilePath: string;
  cacheId: string;
  metadata: EntryMetadata<ContentEntry>;
  getContent: (dependencies: ObservableSet<string>) => Promise<string>;
  getKeywords: (anchors: NgDocPageAnchor[]) => Array<[string, NgDocKeyword]>;
}

interface CacheData {
  dependencies: string[];
  keywords: Array<[string, NgDocKeyword]>;
  usedKeywords: string[];
}

/**
 *
 * @param config
 */
export function contentBuilder(config: Config): Builder<string> {
  const { tag, context, metadata, cacheId, mainFilePath, getContent, getKeywords } = config;
  const dependencies = new ObservableSet<string>();
  let usedKeywords = new Set<string>();
  let keywords = new Map<string, NgDocKeyword>();
  let removeKeywords: () => void = () => {};

  const cacheStrategy = {
    id: cacheId,
    action: 'restore',
    files: () => [metadata.path, mainFilePath, ...dependencies.asArray()],
    getData: () => ({
      dependencies: dependencies.asArray(),
      keywords: Array.from(keywords),
      usedKeywords: Array.from(usedKeywords),
    }),
    onCacheLoad: (data) => {
      dependencies.add(...data.dependencies);
      keywords = new Map(data.keywords);
      usedKeywords = new Set(data.usedKeywords);
    },
    toCache: (content) => content,
    fromCache: (content) => content,
  } satisfies CacheStrategy<CacheData, string>;

  const builder = of(void 0).pipe(
    runBuild(
      tag,
      async () => {
        try {
          // Triggering the touch of the keywords before the build to trigger dependent builders
          // This is needed because keywords can be changed after the build
          touchKeywords(...keywords.keys());

          removeKeywords();
          dependencies.clear();
          usedKeywords.clear();

          const { content, anchors, error } = await UTILS.processHtml(
            await getContent(dependencies),
            {
              headings: context.config.guide?.anchorHeadings,
              route: metadata.absoluteRoute(),
              lightTheme: config.context.config.shiki?.themes.light,
              darkTheme: config.context.config.shiki?.themes.dark,
            },
          );

          if (error) {
            throw new Error(`Error while processing html (${metadata.path})`, {
              cause: error,
            });
          }

          keywords = new Map(getKeywords(anchors));

          const postProcessed = await UTILS.postProcessHtml(content);

          usedKeywords = new Set(postProcessed.usedKeywords);

          return postProcessed.content;
        } catch (cause) {
          throw new Error(`Error while building entry (${metadata.path})`, {
            cause,
          });
        }
      },
      cacheStrategy,
    ),
  );

  return createBuilder(
    [
      createMainTrigger(watchFile(mainFilePath, 'update'), onDependenciesChange(dependencies)),
      createSecondaryTrigger(
        onKeywordsTouch(usedKeywords.has.bind(usedKeywords), keywords.has.bind(keywords)),
      ),
    ],
    () => builder,
  ).pipe(
    tap((state) => {
      if (isBuilderDone(state)) {
        if (keywords.size) {
          removeKeywords = keywordsStore.add(...keywords);

          // Touching the keywords after the build run all builders that depend on
          // the new keywords that might have been added
          !state.fromCache && touchKeywords(...keywords.keys());
        }
      }
    }),
    finalize(() => {
      removeKeywords();
    }),
  );
}
