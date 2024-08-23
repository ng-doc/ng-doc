import { BuilderContext, createBuilder, targetFromTargetString } from '@angular-devkit/architect';
import { BuilderOutputLike } from '@angular-devkit/architect/src/api';
import { executeDevServer } from '@angular-devkit/build-angular/src/builders/dev-server';
import { JsonObject } from '@angular-devkit/core';
import { combineLatest, from, Observable, of } from 'rxjs';
import { first, map, shareReplay, switchMap } from 'rxjs/operators';

import { buildNgDoc } from '../engine';
import { createBuilderContext } from '../helpers';
import { NgDocSchema } from '../interfaces';
import { patchBuilderContext } from './patch-builder-context';

/**
 * Attach NgDocBuilder and run DevServer
 * @param options Builder configuration
 * @param context Builder context
 */
export function runDevServer(
	options: NgDocSchema,
	context: BuilderContext,
): Observable<BuilderOutputLike> {
	const contextWithPatch = patchBuilderContext(context, {
		mock: ['@ng-doc/builder:application', './dist/libs/builder:application'],
		with: '@angular-devkit/build-angular:application',
		optionsTransform: (options: Partial<NgDocSchema>) => {
			delete options.ngDoc;
		},
	});

	const target = options.buildTarget && targetFromTargetString(options.buildTarget);
	const options$: Observable<JsonObject> = target
		? from(context.getTargetOptions(target))
		: of(options as unknown as JsonObject);

	return options$.pipe(
		switchMap((targetOptions) => {
			const builderContext = createBuilderContext(targetOptions, context, options.ngDoc?.config);
			const buildNgDoc$ = buildNgDoc(builderContext).pipe(shareReplay(1));
			return buildNgDoc$.pipe(
				first(),
				switchMap(() =>
					combineLatest([buildNgDoc$, executeDevServer(options, contextWithPatch)]).pipe(
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
