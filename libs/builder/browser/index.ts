import {BuilderContext, createBuilder, Target, targetFromTargetString} from '@angular-devkit/architect';
import {BrowserBuilderOutput, buildWebpackBrowser} from '@angular-devkit/build-angular/src/builders/browser';
import {EMPTY, from, Observable, of} from 'rxjs';
import {catchError, first, switchMap} from 'rxjs/operators';

import {NgDocBuilder} from '../engine/builder';
import {createBuilderContext} from '../helpers';
import {NgDocSchema} from '../interfaces';

/**
 * Attach NgDocWebpackPlugin before Angular Plugins
 *
 * @param options Builder configuration
 * @param context Builder context
 * @returns Observable of BrowserBuilderOutput
 */
export function runBrowser(options: NgDocSchema, context: BuilderContext): Observable<BrowserBuilderOutput> {
	const browserTarget: Target | null = options.browserTarget ? targetFromTargetString(options.browserTarget) : null;

	return (browserTarget ? from(context.getTargetOptions(browserTarget)) : of(options as any)).pipe(
		switchMap((targetOptions: any) => {
			const builder: NgDocBuilder = new NgDocBuilder(createBuilderContext(targetOptions, options, context));
			const runner: Observable<void> = builder.run();

			return runner.pipe(
				first(),
				switchMap(() => buildWebpackBrowser(options as any, context)),
			);
		}),
		catchError((e: unknown) => {
			console.error(e);

			return EMPTY;
		}),
	);
}

export default createBuilder(runBrowser);
