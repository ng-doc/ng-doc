import {
  BuilderContext,
  createBuilder,
  fromAsyncIterable,
  Target,
  targetFromTargetString,
} from '@angular-devkit/architect';
import { buildApplication } from '@angular-devkit/build-angular';
import { firstValueFrom, Observable } from 'rxjs';
import { first } from 'rxjs/operators';

import { newBuild } from '../engine/new-build';
import { createBuilderContext } from '../helpers/create-builder-context';
import { NgDocBuilderContext, NgDocSchema } from '../interfaces';

/**
 * Attach NgDocWebpackPlugin before Angular Plugins
 * @param options Builder configuration
 * @param context Builder context
 * @returns Observable of BrowserBuilderOutput
 */
export async function runBrowser(options: NgDocSchema, context: BuilderContext): Promise<any> {
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
  const runner: Observable<void> = newBuild(builderContext);

  await firstValueFrom(runner.pipe(first()));

  return firstValueFrom(fromAsyncIterable(buildApplication(options as any, context)));
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default createBuilder(runBrowser);
