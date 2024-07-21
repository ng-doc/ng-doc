import {
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
import { debounceTime, map, tap } from 'rxjs/operators';

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
    debounceTime(0),
    map(() => void 0),
    emitCache(),
    progress(),
  ) as Observable<void>;
}
