import {BuilderContext, createBuilder, Target, targetFromTargetString} from '@angular-devkit/architect';
import {BuilderOutputLike} from '@angular-devkit/architect/src/api';
import {DevServerBuilderOutput, serveWebpackBrowser} from '@angular-devkit/build-angular/src/builders/dev-server';
import {combineLatest, from, Observable, of} from 'rxjs';
import {first, map, shareReplay, switchMap, switchMapTo} from 'rxjs/operators';

import {NgDocBuilder} from '../engine/builder';
import {createBuilderContext} from '../helpers';
import {NgDocSchema} from '../interfaces';

/**
 * Attach NgDocBuilder and run DevServer
 *
 * @param options Builder configuration
 * @param context Builder context
 */
export function runDevServer(options: NgDocSchema, context: BuilderContext): Observable<BuilderOutputLike> {
	const browserTarget: Target | null = options.browserTarget ? targetFromTargetString(options.browserTarget) : null;

	return (browserTarget ? from(context.getTargetOptions(browserTarget)) : of(options as unknown as any)).pipe(
		switchMap((targetOptions: any) => {
			const builder: NgDocBuilder = new NgDocBuilder(createBuilderContext(targetOptions, options, context));
			const runner: Observable<void> = builder.run().pipe(shareReplay(1));

			return runner.pipe(
				first(),
				switchMapTo(
					combineLatest([runner, serveWebpackBrowser(options, context)]).pipe(
						map(([_, devServerOutput]: [void, DevServerBuilderOutput]) => devServerOutput),
					),
				),
			);
		}),
	);
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default createBuilder(runDevServer);
