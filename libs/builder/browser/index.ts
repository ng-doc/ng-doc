import {BuilderContext, createBuilder, targetFromTargetString} from '@angular-devkit/architect';
import {Target} from '@angular-devkit/architect/src/api';
import {BrowserBuilderOutput, executeBrowserBuilder} from '@angular-devkit/build-angular';
import {Schema as BrowserBuilderSchema} from '@angular-devkit/build-angular/src/builders/browser/schema';
import {json} from '@angular-devkit/core';
import {from, Observable, of} from 'rxjs';
import {first, switchMap, switchMapTo} from 'rxjs/operators';

import {NgDocBuilder} from '../engine/builder';
import {createBuilderContext} from '../helpers';
import {NgDocSchema} from '../interfaces';
import {NgDocStyleType} from '../types';

/**
 * Attach NgDocWebpackPlugin before Angular Plugins
 *
 * @param options Builder configuration
 * @param context Builder context
 * @returns Observable of BrowserBuilderOutput
 */
export function runBrowser(options: NgDocSchema, context: BuilderContext): Observable<BrowserBuilderOutput> {
	const browserTarget: Target | null = options.browserTarget ? targetFromTargetString(options.browserTarget) : null;

	return (browserTarget ? from(context.getTargetOptions(browserTarget)) : of(options as unknown as json.JsonObject))
		.pipe(
			switchMap((targetOptions: json.JsonObject ) => {
				const builder: NgDocBuilder = new NgDocBuilder(createBuilderContext(targetOptions, options, context));
				const runner: Observable<void> = builder.run();

				return runner.pipe(
					first(),
					switchMapTo(executeBrowserBuilder(options as unknown as BrowserBuilderSchema, context)),
				);
			})
		);

}

export default createBuilder(runBrowser);
