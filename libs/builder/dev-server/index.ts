import { BuilderContext, createBuilder, targetFromTargetString } from '@angular-devkit/architect';
import { BuilderOutputLike } from '@angular-devkit/architect/src/api';
import { executeDevServer } from '@angular-devkit/build-angular/src/builders/dev-server';
import { JsonObject } from '@angular-devkit/core';
import { combineLatest, from, Observable, of } from 'rxjs';
import { first, map, shareReplay, switchMap } from 'rxjs/operators';

import { buildNgDoc } from '../engine/build-ng-doc';
import { createBuilderContext } from '../helpers';
import { NgDocSchema } from '../interfaces';

/**
 * Attach NgDocBuilder and run DevServer
 * @param options Builder configuration
 * @param context Builder context
 */
export function runDevServer(
	options: NgDocSchema,
	context: BuilderContext,
): Observable<BuilderOutputLike> {
	// The DevServer uses EsBuild only for specific builder names.
	// https://github.com/just-jeb/angular-builders/blob/dbf4d281a29c2f93d309bba0e155c3a22965130c/packages/custom-esbuild/src/dev-server/patch-builder-context.ts#L14-L47
	const getBuilderNameForTargetBase = context.getBuilderNameForTarget;
	context.getBuilderNameForTarget = async (target) => {
		const builderName = await getBuilderNameForTargetBase(target);
		if (builderName !== '@ng-doc/builder:application') return builderName;
		return '@angular-devkit/build-angular:application';
	};
	const getTargetOptionsBase = context.getTargetOptions;
	context.getTargetOptions = async (target) => {
		const builderName = await context.getBuilderNameForTarget(target);
		if (builderName !== '@angular-devkit/build-angular:application')
			return getTargetOptionsBase(target);
		const options: Partial<NgDocSchema> = await getTargetOptionsBase(target);
		delete options.ngDoc;
		return options as JsonObject;
	};

	const target = options.buildTarget && targetFromTargetString(options.buildTarget);
	const options$: Observable<JsonObject> = target
		? from(getTargetOptionsBase(target))
		: of(options as unknown as JsonObject);

	return options$.pipe(
		switchMap((targetOptions) => {
			const builderContext = createBuilderContext(targetOptions, context, options.ngDoc?.config);
			const buildNgDoc$ = buildNgDoc(builderContext).pipe(shareReplay(1));
			return buildNgDoc$.pipe(
				first(),
				switchMap(() =>
					combineLatest([buildNgDoc$, executeDevServer(options, context)]).pipe(
						map(([, devServerOutput]) => devServerOutput),
					),
				),
			);
		}),
	);
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default createBuilder(runDevServer);
