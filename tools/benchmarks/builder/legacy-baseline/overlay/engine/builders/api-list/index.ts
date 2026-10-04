import {
  createDeclarationMetadata,
  createDeclarationTabMetadata,
  DeclarationEntry,
  entryBuilder,
  EntryMetadata,
  keywordsStore,
} from '@ng-doc/builder';
import { asArray, EMPTY_FUNCTION, NgDocApi, NgDocApiScope } from '@ng-doc/core';
import fs from 'fs';
import { minimatch } from 'minimatch';
import path from 'path';
import { filter, finalize, merge, startWith, switchMap, takeUntil, tap } from 'rxjs';

import { findDeclarations } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, watchFile, watchFolder, whenDone } from '../../core';
import { pageWrapperBuilder } from '../shared/page-wrapper.builder';
import { apiListBuilder } from './api-list.builder';
import { apiListComponentBuilder } from './api-list-component.builder';
import { apiPageTemplateBuilder } from './api-page-template.builder';
import { renderApiHeader } from './render-api-header';

export const API_ENTRY_BUILDER_TAG = 'ApiFile';
export const API_PAGE_WRAPPER_BUILDER_TAG = 'ApiPageWrapper';

/** Re-enumerate API globs on native TypeScript membership changes. */
export function apiBuilder(context: NgDocBuilderContext, apiPath: string): Builder<FileOutput> {
  let destroyKeyword = EMPTY_FUNCTION;
  const ownedOutputs = new Set<string>();
  const deleted = watchFile(apiPath, 'delete').pipe(
    tap(() => {
      for (const output of ownedOutputs) fs.rmSync(output, { recursive: true, force: true });
      ownedOutputs.clear();
    }),
  );

  return entryBuilder<NgDocApi>({ tag: API_ENTRY_BUILDER_TAG, context, entryPath: apiPath }).pipe(
    whenDone((metadata) => {
      destroyKeyword();
      if (metadata.entry.keyword) {
        destroyKeyword = keywordsStore.add([
          `*${metadata.entry.keyword}`,
          { title: metadata.entry.title, path: metadata.absoluteRoute(), type: 'link' },
        ]);
      }
      return watchFolder(context.context.workspaceRoot, ['create', 'update', 'delete']).pipe(
        filter((events) =>
          events.some((event) =>
            metadata.entry.scopes.some((scope) => matchesScope(context, scope, event.path)),
          ),
        ),
        startWith([]),
        switchMap(() => rebuildApi(context, metadata, ownedOutputs)),
      );
    }),
    takeUntil(deleted),
    finalize(() => destroyKeyword()),
  );
}

function matchesScope(context: NgDocBuilderContext, scope: NgDocApiScope, file: string): boolean {
  if (!/\.[cm]?[jt]sx?$/.test(file)) return false;
  const absolute = file.replace(/\\/g, '/');
  const pattern = (value: string) =>
    path.resolve(context.context.workspaceRoot, value).replace(/\\/g, '/');
  return (
    asArray(scope.include).some((include) =>
      minimatch(absolute, pattern(include), { dot: true }),
    ) &&
    !asArray(scope.exclude).some((exclude) => minimatch(absolute, pattern(exclude), { dot: true }))
  );
}

function rebuildApi(
  context: NgDocBuilderContext,
  metadata: EntryMetadata<NgDocApi>,
  ownedOutputs: Set<string>,
): Builder<FileOutput> {
  const declarations = metadata.entry.scopes.flatMap((scope) =>
    Array.from(
      findDeclarations(context.project, asArray(scope.include), asArray(scope.exclude)).entries(),
    ).map(
      ([id, declaration]) =>
        [id, [scope, createDeclarationMetadata(context, declaration, metadata, scope)]] as const,
    ),
  );
  const data = Array.from(new Map(declarations).values()) as Array<
    [NgDocApiScope, EntryMetadata<DeclarationEntry>]
  >;
  const currentOutputs = new Set(data.map(([, declaration]) => declaration.outDir));
  for (const output of ownedOutputs) {
    if (!currentOutputs.has(output)) fs.rmSync(output, { recursive: true, force: true });
  }
  ownedOutputs.clear();
  for (const output of currentOutputs) ownedOutputs.add(output);
  const pages = data.map(([scope, declaration]) =>
    pageWrapperBuilder({
      tag: API_PAGE_WRAPPER_BUILDER_TAG,
      context,
      metadata: declaration,
      pageType: 'api',
      pageTemplateBuilders: [
        apiPageTemplateBuilder({
          context,
          metadata: declaration,
          tabMetadata: createDeclarationTabMetadata(declaration, {
            title: declaration.title,
            folder: 'api',
          }),
          scope,
        }),
      ],
      getHeaderContent: () => renderApiHeader({ metadata: declaration }),
    }),
  );
  return merge(
    ...pages,
    apiListBuilder({ context, metadata, data }),
    apiListComponentBuilder({ metadata }),
  );
}
