import {BuilderContext, createBuilder} from '@angular-devkit/architect';
import {BrowserBuilderOutput, executeBrowserBuilder} from '@angular-devkit/build-angular';
import {Schema as BrowserBuilderSchema} from '@angular-devkit/build-angular/src/builders/browser/schema';
import {Observable} from 'rxjs';
import {first, shareReplay, switchMapTo} from 'rxjs/operators';

import {NgDocBuilder} from '../engine/builder';
import {NgDocSchema} from '../interfaces';

/**
 * Attach NgDocWebpackPlugin before Angular Plugins
 *
 * @param options Builder configuration
 * @param context Builder context
 * @returns Observable of BrowserBuilderOutput
 */
export function runBrowser(options: NgDocSchema, context: BuilderContext): Observable<BrowserBuilderOutput> {
	const builder: NgDocBuilder = new NgDocBuilder({options, context});
	const runner: Observable<void> = builder.run();

	return runner.pipe(
		first(),
		switchMapTo(executeBrowserBuilder(options as unknown as BrowserBuilderSchema, context)),
	);
}

export default createBuilder(runBrowser);
