import {BuilderContext, createBuilder, targetFromTargetString} from '@angular-devkit/architect';
import {Target} from '@angular-devkit/architect/src/api';
import {BrowserBuilderOutput, executeBrowserBuilder} from '@angular-devkit/build-angular';
import {from, Observable, of} from 'rxjs';
import {first, switchMap} from 'rxjs/operators';

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

	return (browserTarget ? from(context.getTargetOptions(browserTarget)) : of(options as any))
		.pipe(
			switchMap((targetOptions: any ) => {
				const builder: NgDocBuilder = new NgDocBuilder(createBuilderContext(targetOptions, options, context));
				const runner: Observable<void> = builder.run();

				return runner.pipe(
					first(),
					// @ts-ignore
					switchMap(() => executeBrowserBuilder(options as any, context)),
				);
			})
		);

}

export default createBuilder(runBrowser);
