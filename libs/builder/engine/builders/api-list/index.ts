import {
  createDeclarationMetadata,
  entryBuilder,
  EntryMetadata,
  NgDocSupportedDeclaration,
  PageEntry,
} from '@ng-doc/builder';
import { asArray, NgDocApi, NgDocApiScope } from '@ng-doc/core';
import { merge } from 'rxjs';

import { findDeclarations } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, whenDone } from '../../core';
import { apiListBuilder } from './api-list.builder';
import { apiListComponentBuilder } from './api-list-component.builder';
import { apiPageTemplateBuilder } from './api-page-template.builder';

export const API_ENTRY_BUILDER_TAG = 'ApiFile';

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
              [
                scope,
                declaration,
                createDeclarationMetadata(context, declaration, metadata, scope),
              ],
            ]) as Array<
              [string, [NgDocApiScope, NgDocSupportedDeclaration, EntryMetadata<PageEntry>]]
            >,
        )
        .flat();
      const data = Array.from(new Map(declarations).values());
      const pageBuilders = data.map(([scope, declaration, metadata]) =>
        apiPageTemplateBuilder({
          context,
          metadata,
          declaration,
          scope,
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
