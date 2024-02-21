import { getStructuredDocs, onRemoveFromStore, whenBuildersStackIsEmpty } from '@ng-doc/builder';
import { merge } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput } from '../../core';
import { PAGES_STORE } from '../../stores';
import { PAGE_FILE_BUILDER_TAG } from '../page/page-file.builder';
import { contextBuilder } from './context.builder';
import { indexBuilder } from './index.builder';
import { routesBuilder } from './routes.builder';

/**
 *
 * @param context
 */
export function globalBuilders(context: NgDocBuilderContext): Builder<FileOutput> {
  return merge(
    indexBuilder(context),
    merge(whenBuildersStackIsEmpty([PAGE_FILE_BUILDER_TAG]), onRemoveFromStore(PAGES_STORE)).pipe(
      debounceTime(0),
      switchMap(() => {
        const structuredDocs = getStructuredDocs(PAGES_STORE.asArray());

        return merge(
          contextBuilder(context, structuredDocs),
          routesBuilder(context, structuredDocs),
        );
      }),
    ),
  );
}
