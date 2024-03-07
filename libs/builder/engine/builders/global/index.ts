import { afterBuilders, getStructuredDocs } from '@ng-doc/builder';
import { merge } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, onRemoveFromStore, PageStore } from '../../core';
import { PAGE_FILE_BUILDER_TAG } from '../page/page-file.builder';
import { contextBuilder } from './context.builder';
import { indexBuilder } from './index.builder';
import { keywordsBuilder } from './keywords.builder';
import { routesBuilder } from './routes.builder';
import { searchIndexesBuilder } from './search-indexes.builder';

/**
 *
 * @param context
 */
export function globalBuilders(context: NgDocBuilderContext): Builder<FileOutput> {
  return merge(
    indexBuilder(context),
    searchIndexesBuilder(context),
    keywordsBuilder(context),
    merge(afterBuilders([PAGE_FILE_BUILDER_TAG]), onRemoveFromStore(PageStore)).pipe(
      switchMap(() => {
        const structuredDocs = getStructuredDocs(PageStore.asArray());

        return merge(
          contextBuilder(context, structuredDocs),
          routesBuilder(context, structuredDocs),
        );
      }),
    ),
  );
}
