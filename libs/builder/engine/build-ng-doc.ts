import {
  allEntriesResolved,
  disableCache,
  emitCache,
  emitFileOutput,
  entriesEmitter,
  GLOBALS,
  loadGlobalKeywords,
  printBuildProgress,
  printErrors,
  setColdStartFalse,
  whenStackIsEmpty,
} from '@ng-doc/builder';
import fs from 'fs';
import { forkJoin, merge, Observable, switchMap } from 'rxjs';
import { debounceTime, filter, map, tap } from 'rxjs/operators';

import { importEsm, importUtils } from '../helpers';
import { NgDocBuilderContext } from '../interfaces';
import { progress } from '../operators';
import { globalBuilders } from './builders/global';
import { invalidateCacheIfNeeded } from './cache';
import { resolveAsyncFileOutputs } from './core/operators/resolve-async-file-outputs';

/**
 *
 * @param context
 */
export function buildNgDoc(context: NgDocBuilderContext): Observable<void> {
  // Set global variables
  GLOBALS.workspaceRoot = context.context.workspaceRoot;

  if (!context.config.cache) {
    disableCache();
  }

  if (!!context.config?.cache && invalidateCacheIfNeeded(context.cachedFiles)) {
    // do nothing
  } else {
    fs.rmSync(context.outDir, { recursive: true, force: true });
  }

  const emitter = forkJoin([
    loadGlobalKeywords(context),
    importUtils(),
    importEsm('@angular/compiler'),
  ]).pipe(switchMap(() => merge(entriesEmitter(context), globalBuilders(context))));

  /**
   * The pipeline emits every time the builder stack is empty, but on the initial build
   * an empty stack does not guarantee that every entry page has been collected into the
   * PageStore (entries can register late). Hold back the first emission until all
   * discovered entries have resolved, so the very first build the application/dev-server
   * builders consume is generated from a complete PageStore (see issue #322). Subsequent
   * (watch) rebuilds are not gated.
   */
  let initialBuildComplete = false;

  return emitter.pipe(
    printBuildProgress(),
    whenStackIsEmpty(),
    resolveAsyncFileOutputs(),
    emitFileOutput(),
    tap(() => {
      setColdStartFalse();
      // console.log(
      //   output.state,
      //   isBuilderDone(output) ? output.result.filePath : output.error,
      // );
    }),
    printErrors(),
    filter(() => {
      if (initialBuildComplete) {
        return true;
      }

      initialBuildComplete = allEntriesResolved();

      return initialBuildComplete;
    }),
    debounceTime(100),
    map(() => void 0),
    emitCache(),
    progress(),
  ) as Observable<void>;
}
