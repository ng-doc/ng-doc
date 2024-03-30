import { OperatorFunction } from 'rxjs';
import { tap } from 'rxjs/operators';

import { printProgress } from '../../../helpers';
import { STACK } from './stack';

/**
 *
 */
export function printBuildProgress<T>(): OperatorFunction<T, T> {
  return (source) =>
    source.pipe(
      tap(() => {
        const tasksLeft = Array.from(STACK.values()).reduce((acc, stack) => acc + stack.size, 0);

        printProgress(`Building... (${tasksLeft})`);
      }),
    );
}
