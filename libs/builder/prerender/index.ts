import {
	BuilderContext,
	createBuilder,
	Target,
	targetFromTargetString,
} from '@angular-devkit/architect';
import { execute } from '@angular-devkit/build-angular/src/builders/prerender';
import { firstValueFrom, Observable } from 'rxjs';
import { first } from 'rxjs/operators';

import { buildNgDoc } from '../engine/build-ng-doc';
import { createBuilderContext } from '../helpers';
import { NgDocBuilderContext, NgDocSchema } from '../interfaces';

/**
 * Attach NgDocWebpackPlugin before Angular Plugins
 * @param options Builder configuration
 * @param context Builder context
 */
export async function ssrPrerender(options: NgDocSchema, context: BuilderContext): Promise<any> {
	const browserTarget: Target | null = options.buildTarget
		? targetFromTargetString(options.buildTarget)
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

	return execute(options as any, context);
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default createBuilder(ssrPrerender);
