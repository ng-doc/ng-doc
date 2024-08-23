import { Observable, ReplaySubject } from 'rxjs';
import { filter, map, switchMap, take, tap } from 'rxjs/operators';

import { BuilderState, isBuilderPending } from '../types';

export type BuildStage = 'build' | 'postBuild';

let builderId = 0;
const stagesOrder: BuildStage[] = ['build', 'postBuild'];
const currentStage: ReplaySubject<BuildStage> = new ReplaySubject(1);
const currentStageStack: Set<number> = new Set();

/**
 *
 * @param stage
 * @param project
 */
export function onStage<T>(
  stage: BuildStage,
  project: () => Observable<BuilderState<T>>,
): Observable<BuilderState<T>> {
  const id = builderId++;

  return project().pipe(
    tap((state) => {
      isBuilderPending(state) ? currentStageStack.add(id) : currentStageStack.delete(id);

      Promise.resolve().then(() => {
        if (!currentStageStack.size) {
          currentStage.next(stagesOrder[stagesOrder.indexOf(stage) + (1 % stagesOrder.length)]);
        }
      });
    }),
    filter((state) => !isBuilderPending(state)),
    switchMap((state) =>
      currentStage.pipe(
        filter((current) => stagesOrder.indexOf(current) >= stagesOrder.indexOf(stage)),
        take(1),
        map(() => state),
      ),
    ),
  );
}
