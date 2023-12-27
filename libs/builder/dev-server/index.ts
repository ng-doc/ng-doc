import {
	BuilderContext,
	createBuilder,
	Target,
	targetFromTargetString,
} from '@angular-devkit/architect';
import { BuilderOutputLike } from '@angular-devkit/architect/src/api';
import {
	DevServerBuilderOutput,
	executeDevServer,
} from '@angular-devkit/build-angular/src/builders/dev-server';
import { combineLatest, from, Observable, of } from 'rxjs';
import { first, map, shareReplay, switchMap } from 'rxjs/operators';

import { newBuild } from '../engine/new-build';
import { createBuilderContext } from '../helpers';
import { NgDocBuilderContext, NgDocSchema } from '../interfaces';

/**
 * Attach NgDocBuilder and run DevServer
 * @param options Builder configuration
 * @param context Builder context
 */
export function runDevServer(
	options: NgDocSchema,
	context: BuilderContext,
): Observable<BuilderOutputLike> {
	const browserTarget: Target | null = options.buildTarget
		? targetFromTargetString(options.buildTarget)
		: null;

	return (
		browserTarget ? from(context.getTargetOptions(browserTarget)) : of(options as unknown as any)
	).pipe(
		switchMap((targetOptions: any) => {
			const builderContext: NgDocBuilderContext = createBuilderContext(
				targetOptions,
				context,
				options.ngDoc?.config,
			);
			const runner: Observable<void> = newBuild(builderContext).pipe(shareReplay(1));

			// This is a hack to make sure that the dev server uses the esbuild builder
			// instead of the webpack builder. This is necessary because Angular checks
			// the builder name to determine which builder to use for the dev server.
			// https://github.com/angular/angular-cli/blob/9d8f6289faefa7241212f9412e70717609ef47ad/packages/angular_devkit/build_angular/src/builders/dev-server/builder.ts#L48
			context.getBuilderNameForTarget = async () => '@angular-devkit/build-angular:application';

			return runner.pipe(
				first(),
				switchMap(() =>
					combineLatest([runner, executeDevServer(options, context)]).pipe(
						map(([, devServerOutput]: [void, DevServerBuilderOutput]) => devServerOutput),
					),
				),
			);
		}),
	);
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default createBuilder(runDevServer);
