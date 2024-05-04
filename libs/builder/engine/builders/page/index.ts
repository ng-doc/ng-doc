import { asArray, NgDocPage } from '@ng-doc/core';
import { merge, takeUntil } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { AsyncFileOutput, Builder, FileOutput, watchFile, whenDone } from '../../core';
import { entryBuilder } from '../shared';
import { pageWrapperBuilder } from '../shared/page-wrapper.builder';
import { demoAssetsBuilder } from './demo-assets.builder';
import { guideTemplateBuilder } from './guide-template.builder';
import { playgroundBuilder } from './playground.builder';
import { renderPageHeader } from './render-page-header';

export const PAGE_ENTRY_BUILDER_TAG = 'PageFile';
export const GUIDE_PAGE_WRAPPER_BUILDER_TAG = 'GuidePageWrapper';

/**
 *
 * @param context
 * @param path
 * @param pagePath
 */
export function pageBuilder(
  context: NgDocBuilderContext,
  pagePath: string,
): Builder<AsyncFileOutput | FileOutput> {
  return entryBuilder<NgDocPage>({
    tag: PAGE_ENTRY_BUILDER_TAG,
    context,
    entryPath: pagePath,
  }).pipe(
    whenDone((page) => {
      const pageTemplateBuilders = asArray(page.entry.mdFile).map((mdFile) =>
        guideTemplateBuilder({ context, pageMetadata: page, mdFile }),
      );

      return merge(
        pageWrapperBuilder({
          tag: GUIDE_PAGE_WRAPPER_BUILDER_TAG,
          context,
          metadata: page,
          pageType: 'guide',
          pageTemplateBuilders,
          getHeaderContent: () => renderPageHeader({ context, metadata: page }),
        }),
        demoAssetsBuilder({ context, page }),
        playgroundBuilder({ page }),
      );
    }),
    takeUntil(watchFile(pagePath, 'delete')),
  );
}
