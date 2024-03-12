import { NgDocSupportedDeclaration } from '@ng-doc/builder';
import { asArray, NgDocApi, NgDocApiList, NgDocApiScope } from '@ng-doc/core';
import path from 'path';
import { of } from 'rxjs';

import { getKindType } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, runBuild } from '../../core';
import { EntryMetadata, PageEntry } from '../interfaces';

interface Config {
  context: NgDocBuilderContext;
  metadata: EntryMetadata<NgDocApi>;
  data: Array<[NgDocApiScope, NgDocSupportedDeclaration, EntryMetadata<PageEntry>]>;
}

export const API_LIST_BUILDER_TAG = 'ApiList';

/**
 *
 * @param config
 */
export function apiListBuilder(config: Config): Builder<FileOutput> {
  const { context, metadata, data } = config;

  return of(void 0).pipe(
    runBuild(API_LIST_BUILDER_TAG, async () => ({
      filePath: path.join(...asArray(context.outAssetsDir, metadata.entry.route, 'api-list.json')),
      content: JSON.stringify(buildApiList(data), undefined, 2),
    })),
  );
}

/**
 *
 * @param context
 * @param data
 */
function buildApiList(
  data: Array<[NgDocApiScope, NgDocSupportedDeclaration, EntryMetadata<PageEntry>]>,
): NgDocApiList[] {
  const uniqScopes = data.reduce((lists, [scope, declaration, metadata]) => {
    lists.set(scope, (lists.get(scope) ?? []).concat([[declaration, metadata]]));

    return lists;
  }, new Map<NgDocApiScope, Array<[NgDocSupportedDeclaration, EntryMetadata<PageEntry>]>>());

  return Array.from(uniqScopes.entries()).map(
    ([scope, items]) =>
      ({
        title: scope.name,
        items: items.map(([declaration, metadata]) => ({
          route: metadata.absoluteRoute(),
          type: getKindType(declaration) ?? '',
          name: declaration.getName() ?? '[Unknown]',
        })),
      }) satisfies NgDocApiList,
  );
}
