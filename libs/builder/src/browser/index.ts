import {BuilderContext, createBuilder} from '@angular-devkit/architect';
import {BrowserBuilderOutput, executeBrowserBuilder} from '@angular-devkit/build-angular';
import {NgDocSchema} from '@ng-doc/core';
import {combineLatest, Observable} from 'rxjs';
import {first, map, shareReplay, switchMapTo, take} from 'rxjs/operators';
import {NgDocBuilder} from '../builder';

/**
 * Attach NgDocWebpackPlugin before Angular Plugins
 *
 * @param options Builder configuration
 * @param context Builder context
 */
export function runBuilder(options: NgDocSchema, context: BuilderContext): Observable<BrowserBuilderOutput> {
  const builder: NgDocBuilder = new NgDocBuilder({options, context});
  const runner: Observable<void> = builder.run().pipe(shareReplay(1));

  return runner
    .pipe(take(1))
    .pipe(
      switchMapTo(
        combineLatest([runner.pipe(first()), executeBrowserBuilder(options as any, context)]).pipe(
          map(([_, devServerOutput]) => devServerOutput),
        ),
      ),
    );
}

export default createBuilder(runBuilder);
