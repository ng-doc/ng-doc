import {
  disableCache,
  emitFileOutput,
  entriesEmitter,
  isBuilderDone,
  loadGlobalKeywords,
  setColdStartFalse,
  whenStackIsEmpty,
} from '@ng-doc/builder';
import { from, merge, Observable, switchMap } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';

import { NgDocBuilderContext } from '../interfaces';
import { globalBuilders } from './builders/global';
import { resolveAsyncFileOutputs } from './core/operators/resolve-async-file-outputs';

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

  const emitter = from(loadGlobalKeywords(context)).pipe(
    switchMap(() => merge(entriesEmitter(context), globalBuilders(context))),
  );

  return emitter.pipe(
    tap((output) => {
      // @ts-expect-error develop
      console.log('preStack', output.tag, output.state, output.result?.filePath);
      if (output.state === 'error') {
        console.error(output.error);
      }

      // print all tags from STACK that are not empty
      // for (const [tag, stack] of STACK) {
      //   if (stack.size) {
      //     console.log(tag, stack.size);
      //   }
      // }
    }),
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
    // filter(() => false),
  );
}
