import {BuilderContext, createBuilder, targetFromTargetString} from '@angular-devkit/architect';
import {Target} from '@angular-devkit/architect/src/api';
import {DevServerBuilderOutput, executeDevServerBuilder} from '@angular-devkit/build-angular';
import {json} from '@angular-devkit/core';
import {combineLatest, from, Observable} from 'rxjs';
import {first, map, shareReplay, switchMap, switchMapTo, take} from 'rxjs/operators';

import {NgDocBuilder} from '../engine/builder';
import {NgDocSchema} from '../interfaces';
import {NgDocStyleType} from '../types';

/**
 * Attach NgDocBuilder and run DevServer
 *
 * @param options Builder configuration
 * @param context Builder context
 */
export function runDevServer(options: NgDocSchema, context: BuilderContext): Observable<DevServerBuilderOutput> {
	const browserTarget: Target = targetFromTargetString(options.browserTarget);

	return from(context.getTargetOptions(browserTarget))
		.pipe(
			switchMap((targetOptions: json.JsonObject ) => {
				const builder: NgDocBuilder = new NgDocBuilder({
					options,
					context,
					inlineStyleLanguage: (targetOptions?.['inlineStyleLanguage'] as NgDocStyleType) ?? 'css',
				});
				const runner: Observable<void> = builder.run().pipe(shareReplay(1));

				return runner.pipe(
					first(),
					switchMapTo(
						combineLatest([runner, executeDevServerBuilder(options, context)]).pipe(
							map(([_, devServerOutput]: [void, DevServerBuilderOutput]) => devServerOutput),
						),
					),
				);
			})
		)

}

export default createBuilder(runDevServer);
