import {BuilderContext, createBuilder} from '@angular-devkit/architect';
import {DevServerBuilderOutput, executeDevServerBuilder} from '@angular-devkit/build-angular';
import {combineLatest, Observable} from 'rxjs';
import {first, map, shareReplay, switchMapTo, take} from 'rxjs/operators';

import {NgDocBuilder} from '../engine/builder';
import {NgDocSchema} from '../interfaces';

/**
 * Attach NgDocBuilder and run DevServer
 *
 * @param options Builder configuration
 * @param context Builder context
 */
export function runDevServer(options: NgDocSchema, context: BuilderContext): Observable<DevServerBuilderOutput> {
	const builder: NgDocBuilder = new NgDocBuilder({options, context});
	const runner: Observable<void> = builder.run().pipe(shareReplay(1));

	return runner.pipe(
		first(),
		switchMapTo(
			combineLatest([runner, executeDevServerBuilder(options, context)]).pipe(
				map(([_, devServerOutput]: [void, DevServerBuilderOutput]) => devServerOutput),
			),
		),
	);
}

export default createBuilder(runDevServer);
