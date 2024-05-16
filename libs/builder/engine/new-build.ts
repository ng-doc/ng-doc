import {
  disableCache,
  emitFileOutput,
  entriesEmitter,
  isBuilderDone,
  loadGlobalKeywords,
  printBuildProgress,
  setColdStartFalse,
  whenStackIsEmpty,
} from '@ng-doc/builder';
import fs from 'fs';
import { from, merge, Observable, switchMap } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';

import { NgDocBuilderContext } from '../interfaces';
import { progress } from '../operators';
import { globalBuilders } from './builders/global';
import { resolveAsyncFileOutputs } from './core/operators/resolve-async-file-outputs';
import { invalidateCacheIfNeeded } from './entities/cache';

/**
 *
 * @param context
 */
export function newBuild(context: NgDocBuilderContext): Observable<void> {
  let count = 0;
  console.time('build');

  if (!context.config.cache) {
    disableCache();
  }

  if (!!context.config?.cache && invalidateCacheIfNeeded(context.cachedFiles)) {
    // do nothing
  } else {
    fs.rmSync(context.outDir, { recursive: true, force: true });
  }

  const emitter = from(loadGlobalKeywords(context)).pipe(
    switchMap(() => merge(entriesEmitter(context), globalBuilders(context))),
  );

  return emitter.pipe(
    tap((output) => {
      // console .log('preStack', output.tag, output.state, output.result?.filePath);
      // if (output.state === 'error') {
      //   console.error(output.error);
      // }
      // print all tags from STACK that are not empty
      // for (const [tag, stack] of STACK) {
      //   if (stack.size) {
      //     console.log(tag, stack.size);
      //   }
      // }
    }),
    printBuildProgress(),
    whenStackIsEmpty(),
    resolveAsyncFileOutputs(),
    emitFileOutput(),
    tap((output) => {
      setColdStartFalse();

      console.log(
        count++,
        output.state,
        isBuilderDone(output) ? output.result.filePath : output.error,
      );
    }),
    debounceTime(0),
    map(() => void 0),
    tap(() => {
      console.timeEnd('build');
    }),
    progress(),
    // filter(() => false),
  ) as Observable<void>;
}
