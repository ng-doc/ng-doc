import {
	BuilderContext,
	createBuilder,
	fromAsyncIterable,
	Target,
	targetFromTargetString,
} from '@angular-devkit/architect';
import { buildWebpackBrowser } from '@angular-devkit/build-angular/src/builders/browser';
import { buildEsbuildBrowser } from '@angular-devkit/build-angular/src/builders/browser-esbuild';
import { firstValueFrom, Observable } from 'rxjs';
import { first } from 'rxjs/operators';

import { buildNgDoc } from '../engine/build-ng-doc';
import { createBuilderContext } from '../helpers';
import { NgDocBuilderContext, NgDocSchema } from '../interfaces';

/**
 * Attach NgDocWebpackPlugin before Angular Plugins
 *
 * @param options Builder configuration
 * @param context Builder context
 * @returns Observable of BrowserBuilderOutput
 */
export async function runBrowser(options: NgDocSchema, context: BuilderContext): Promise<any> {
	const browserTarget: Target | null = options.browserTarget
		? targetFromTargetString(options.browserTarget)
		: null;
	const targetOptions: any = browserTarget
		? await context.getTargetOptions(browserTarget)
		: (options as any);
	const builderContext: NgDocBuilderContext = createBuilderContext(
		targetOptions,
		context,
		options.ngDoc?.config,
	);
	const runner: Observable<void> = buildNgDoc(builderContext);

	await firstValueFrom(runner.pipe(first()));

	return builderContext.config.angularBuilder === 'esbuild'
		? fromAsyncIterable(buildEsbuildBrowser(options as any, context)).toPromise()
		: await buildWebpackBrowser(options as any, context).toPromise();
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default createBuilder(runBrowser);
