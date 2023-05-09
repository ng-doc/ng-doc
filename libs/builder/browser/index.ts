import {BuilderContext, createBuilder, Target, targetFromTargetString} from '@angular-devkit/architect';
import {buildWebpackBrowser} from '@angular-devkit/build-angular/src/builders/browser';
import {buildEsbuildBrowser} from '@angular-devkit/build-angular/src/builders/browser-esbuild';
import {Observable} from 'rxjs';
import {first} from 'rxjs/operators';

import {NgDocBuilder} from '../engine/builder';
import {createBuilderContext} from '../helpers';
import {NgDocBuilderContext, NgDocSchema} from '../interfaces';

/**
 * Attach NgDocWebpackPlugin before Angular Plugins
 *
 * @param options Builder configuration
 * @param context Builder context
 * @returns Observable of BrowserBuilderOutput
 */
export async function runBrowser(options: NgDocSchema, context: BuilderContext): Promise<any> {
	const browserTarget: Target | null = options.browserTarget ? targetFromTargetString(options.browserTarget) : null;
	const targetOptions: any = browserTarget ? await context.getTargetOptions(browserTarget) : (options as any);
    const builderContext: NgDocBuilderContext = createBuilderContext(targetOptions, options, context);
	const builder: NgDocBuilder = new NgDocBuilder(builderContext);
	const runner: Observable<void> = builder.run();

	await runner.pipe(first()).toPromise();

	return builderContext.config.angularBuilder === 'esbuild'
		? buildEsbuildBrowser(options as any, context)
		: buildWebpackBrowser(options as any, context)
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default createBuilder(runBrowser);
