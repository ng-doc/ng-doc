import { EMPTY, merge } from 'rxjs';
import { debounceTime, filter, map, startWith, switchMap, tap } from 'rxjs/operators';

import { Builder, isMainTrigger, isSecondaryTrigger, Trigger } from '../types';

let builderId: number = 0;
const triggersStack = new Set<number>();

/**
 *
 * @param triggers
 * @param project
 * @param main
 * @param secondary
 * @param autoStart
 */
export function createBuilder<T>(
  triggers: Trigger[],
  project: () => Builder<T>,
  autoStart: boolean = true,
): Builder<T> {
  const id = builderId++;
  const main = triggers.filter(isMainTrigger).map(({ trigger }) => trigger);
  const secondary = triggers.filter(isSecondaryTrigger).map(({ trigger }) => trigger);

  const mainTrigger = (main ? merge(...main) : EMPTY).pipe(tap(() => triggersStack.clear()));
  const secondaryTrigger = (secondary ? merge(...secondary) : EMPTY).pipe(
    filter(() => !triggersStack.has(id)),
  );

  return merge(mainTrigger, secondaryTrigger).pipe(
    debounceTime(0),
    autoStart ? startWith(void 0) : tap(),
    map(() => id),
    switchMap(() => {
      triggersStack.add(id);

      return project();
    }),
  );
}
