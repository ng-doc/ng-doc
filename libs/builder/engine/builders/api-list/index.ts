import {
  createDeclarationMetadata,
  createDeclarationTabMetadata,
  DeclarationEntry,
  entryBuilder,
  EntryMetadata,
} from '@ng-doc/builder';
import { asArray, NgDocApi, NgDocApiScope } from '@ng-doc/core';
import { merge } from 'rxjs';

import { findDeclarations } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, whenDone } from '../../core';
import { pageWrapperBuilder } from '../shared/page-wrapper.builder';
import { apiListBuilder } from './api-list.builder';
import { apiListComponentBuilder } from './api-list-component.builder';
import { apiPageTemplateBuilder } from './api-page-template.builder';

export const API_ENTRY_BUILDER_TAG = 'ApiFile';
export const API_PAGE_WRAPPER_BUILDER_TAG = 'ApiPageWrapper';
/**
 *
 * @param context
 * @param apiPath
 */
export function apiBuilder(context: NgDocBuilderContext, apiPath: string): Builder<FileOutput> {
  return entryBuilder<NgDocApi>({ tag: API_ENTRY_BUILDER_TAG, context, entryPath: apiPath }).pipe(
    whenDone((metadata) => {
      const declarations = metadata.entry.scopes
        .map(
          (scope) =>
            Array.from(
              findDeclarations(
                context.project,
                asArray(scope.include),
                asArray(scope.exclude),
              ).entries(),
            ).map(([id, declaration]) => [
              id,
              [scope, createDeclarationMetadata(context, declaration, metadata, scope)],
            ]) as Array<[string, [NgDocApiScope, EntryMetadata<DeclarationEntry>]]>,
        )
        .flat();
      const data = Array.from(new Map(declarations).values());
      const pageBuilders = data.map(([scope, metadata]) =>
        pageWrapperBuilder({
          tag: API_PAGE_WRAPPER_BUILDER_TAG,
          context,
          metadata,
          pageTemplateBuilders: [
            apiPageTemplateBuilder({
              context,
              metadata,
              tabMetadata: createDeclarationTabMetadata(metadata, { title: 'API', folder: 'api' }),
              scope,
            }),
          ],
        }),
      );

      return merge(
        ...pageBuilders,
        apiListBuilder({ context, metadata, data }),
        apiListComponentBuilder({ metadata }),
      );
    }),
  );
}
