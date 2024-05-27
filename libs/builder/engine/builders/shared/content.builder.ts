import {
  ContentEntry,
  createBuilder,
  createMainTrigger,
  createSecondaryTrigger,
  isBuilderDone,
  onKeywordsTouch,
  postProcessHtml,
  processHtml,
} from '@ng-doc/builder';
import { NgDocKeyword, NgDocPageAnchor } from '@ng-doc/core';
import { finalize, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { ObservableSet } from '../../../classes';
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
  anchors: NgDocPageAnchor[];
  usedKeywords: string[];
}

/**
 *
 * @param config
 */
export function contentBuilder(config: Config): Builder<string> {
  const { tag, context, metadata, cacheId, mainFilePath, getContent, getKeywords } = config;
  const dependencies = new ObservableSet<string>();
  const anchors = [] as NgDocPageAnchor[];
  const usedKeywords = new Set<string>();
  let keywords = new Map<string, NgDocKeyword>();
  let removeKeywords: () => void = () => {};

  const cacheStrategy = {
    id: cacheId,
    action: 'restore',
    files: () => [metadata.path, mainFilePath, ...dependencies.asArray()],
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
      tag,
      async () => {
        try {
          // Triggering the touch of the keywords before the build to trigger dependent builders
          // This is needed because keywords can be changed after the build
          touchKeywords(...keywords.keys());

          removeKeywords();
          anchors.length = 0;
          dependencies.clear();
          usedKeywords.clear();

          let content = await getContent(dependencies);

          content = await processHtml(content, {
            headings: context.config.guide?.anchorHeadings,
            route: metadata.absoluteRoute(),
            addAnchor: anchors.push.bind(anchors),
          });

          keywords = new Map(getKeywords(anchors));

          return postProcessHtml(content, { addUsedKeyword: usedKeywords.add.bind(usedKeywords) });
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
      createSecondaryTrigger(onKeywordsTouch(usedKeywords, keywords.has.bind(keywords))),
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

      console.log('DESTROY CONTENT BUILDER', metadata.path);
    }),
  );
}
