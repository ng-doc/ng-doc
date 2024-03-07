import { concatMap, EMPTY, forkJoin, from, of, OperatorFunction, switchMap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import {
  AsyncFileOutput,
  BuilderDone,
  BuilderError,
  EndStates,
  FileOutput,
  isBuilderError,
  isFileOutput,
} from '../types';

/**
 *
 */
export function resolveAsyncFileOutputs(): OperatorFunction<
  Array<EndStates<FileOutput | AsyncFileOutput>>,
  EndStates<FileOutput>
> {
  return (source) =>
    source.pipe(
      concatMap((states) => {
        const result = states.map((state) => {
          if (isBuilderError(state)) {
            return of(state);
          } else {
            if (isFileOutput(state.result)) {
              return of(state as BuilderDone<FileOutput>);
            }

            return from(state.result()).pipe(
              map((output) => new BuilderDone(state.tag, output)),
              catchError((error) => of(new BuilderError(state.tag, error))),
            );
          }
        });

        if (!result.length) {
          return EMPTY;
        }

        return forkJoin(result).pipe(
          switchMap((outputs) => {
            return of(...outputs);
          }),
        );
      }),
    );
}
