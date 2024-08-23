import { asyncScheduler, EMPTY, merge, subscribeOn } from 'rxjs';
import { filter, map, startWith, switchMap, tap } from 'rxjs/operators';

import { Builder, isBuilderDone, isMainTrigger, isSecondaryTrigger, Trigger } from '../types';

let builderId: number = 0;
const blockedBuilders = new Set<number>();

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

  const mainTrigger = (main ? merge(...main) : EMPTY).pipe(tap(() => blockedBuilders.clear()));
  const secondaryTrigger = (secondary ? merge(...secondary) : EMPTY).pipe(
    filter(() => !blockedBuilders.has(id)),
  );

  return merge(mainTrigger, secondaryTrigger).pipe(
    subscribeOn(asyncScheduler),
    autoStart ? startWith(void 0) : tap(),
    map(() => id),
    switchMap(() => {
      blockedBuilders.add(id);

      return project().pipe(
        tap((state) => {
          if (isBuilderDone(state) && state.fromCache) {
            blockedBuilders.delete(id);
          }
        }),
      );
    }),
  );
}
