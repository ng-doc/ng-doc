import { asArray, NgDocPage } from '@ng-doc/core';
import fs from 'fs';
import { merge, tap, takeUntil } from 'rxjs';

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

/** Delete the output directory owned by a page when its entry is physically deleted. */
export function pageBuilder(
  context: NgDocBuilderContext,
  pagePath: string,
): Builder<AsyncFileOutput | FileOutput> {
  let ownedOutput: string | undefined;
  const deleted = watchFile(pagePath, 'delete').pipe(
    tap(() => {
      if (ownedOutput) fs.rmSync(ownedOutput, { recursive: true, force: true });
    }),
  );
  return entryBuilder<NgDocPage>({
    tag: PAGE_ENTRY_BUILDER_TAG,
    context,
    entryPath: pagePath,
  }).pipe(
    whenDone((page) => {
      ownedOutput = page.outDir;
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
    takeUntil(deleted),
  );
}
