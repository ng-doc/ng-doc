import {BuilderContext, createBuilder} from '@angular-devkit/architect';
import {DevServerBuilderOutput, executeDevServerBuilder} from '@angular-devkit/build-angular';
import {NgDocSchema} from '@ng-doc/core';
import {combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {NgDocBuilder} from '../builder';

/**
 * Attach NgDocBuilder and run DevServer
 *
 * @param options Builder configuration
 * @param context Builder context
 */
export function runBuilder(options: NgDocSchema, context: BuilderContext): Observable<DevServerBuilderOutput> {
	const builder: NgDocBuilder = new NgDocBuilder({options, context});

	return combineLatest([builder.run(), executeDevServerBuilder(options, context)]).pipe(
		map(([_, devServerOutput]: [void, DevServerBuilderOutput]) => devServerOutput),
	);
}

export default createBuilder(runBuilder);
