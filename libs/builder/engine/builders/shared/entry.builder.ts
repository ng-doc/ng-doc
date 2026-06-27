import { NgDocApi, NgDocPage } from '@ng-doc/core';
import { finalize, of, takeUntil, tap } from 'rxjs';

import { ObservableSet } from '../../../classes';
import { buildFileEntity, importFreshEsm } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import {
  Builder,
  createBuilder,
  createMainTrigger,
  FailedEntries,
  isBuilderDone,
  isBuilderError,
  onDependenciesChange,
  PageStore,
  runBuild,
  watchFile,
} from '../../core';
import { createEntryMetadata } from '../helpers';
import { EntryMetadata, FileEntry } from '../interfaces';

interface Config {
  tag: string;
  context: NgDocBuilderContext;
  entryPath: string;
}

/**
 * A builder function for a entry file.
 *
 * This function returns a Builder Observable that emits a NgDocPage object whenever the file at the provided path changes.
 * The Builder Observable is created by merging an Observable that emits on file changes.
 * When the file changes, the build function is called, which compiles the TypeScript file, imports it as an ES module, and returns the default export.
 * @returns {Builder<NgDocPage>} - A Builder Observable that emits a NgDocPage object whenever the file at the provided path changes.
 * @param config - The configuration object for the builder.
 */
export function entryBuilder<T extends NgDocPage | NgDocApi>(
  config: Config,
): Builder<EntryMetadata<T>> {
  const { tag, context, entryPath } = config;
  const sourceFile = context.project.addSourceFileAtPath(entryPath);
  const dependencies = new ObservableSet<string>();

  const builder = of(void 0).pipe(
    runBuild(tag, async () => {
      dependencies.clear();

      await sourceFile.refreshFromFileSystem();

      const outPath = await buildFileEntity(
        sourceFile,
        context.tsConfig,
        context.context.workspaceRoot,
      );
      const page = (await importFreshEsm<{ default: T }>(outPath)).default;
      const metadata = createEntryMetadata(context, page, sourceFile);

      addCategoriesToDependencies(metadata, dependencies);

      PageStore.add([entryPath, metadata]);

      return metadata;
    }),
  );

  return createBuilder(
    [createMainTrigger(watchFile(entryPath, 'update'), onDependenciesChange(dependencies))],
    () => builder,
  ).pipe(
    tap((state) => {
      // Track whether this entry failed to build so the completion gate doesn't wait
      // forever for a page that will never register (see issue #322).
      if (isBuilderError(state)) {
        FailedEntries.add(entryPath);
      } else if (isBuilderDone(state)) {
        FailedEntries.delete(entryPath);
      }
    }),
    finalize(() => {
      PageStore.delete(entryPath);
      FailedEntries.delete(entryPath);
    }),
    takeUntil(watchFile(entryPath, 'delete')),
  );
}

/**
 *
 * @param metadata
 * @param dependencies
 */
function addCategoriesToDependencies(
  metadata: EntryMetadata<FileEntry>,
  dependencies: ObservableSet<string>,
) {
  if (metadata.parent) {
    dependencies.add(metadata.parent.sourceFile.getFilePath());

    addCategoriesToDependencies(metadata.parent, dependencies);
  }
}
