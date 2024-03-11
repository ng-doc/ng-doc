import { entryBuilder } from '@ng-doc/builder';
import { asArray, NgDocApi } from '@ng-doc/core';
import { merge } from 'rxjs';

import { findDeclarations } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, whenDone } from '../../core';
import { apiPageTemplateBuilder } from './api-page-template.builder';

export const API_ENTRY_BUILDER_TAG = 'ApiFile';

/**
 *
 * @param context
 * @param apiPath
 */
export function apiListBuilder(context: NgDocBuilderContext, apiPath: string): Builder<FileOutput> {
  return entryBuilder<NgDocApi>({ tag: API_ENTRY_BUILDER_TAG, context, entryPath: apiPath }).pipe(
    whenDone((api) => {
      const pageBuilders = api.entry.scopes
        .map((scope) =>
          Array.from(
            findDeclarations(
              context.project,
              asArray(scope.include),
              asArray(scope.exclude),
            ).entries(),
          ).map(([id, declaration]) => apiPageTemplateBuilder({ context, api, declaration })),
        )
        .flat();

      return merge(...pageBuilders);
    }),
  );
}
