import { of } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, BuilderPending, FileOutput } from '../../core';

/**
 *
 * @param context
 * @param apiPath
 */
export function apiListBuilder(context: NgDocBuilderContext, apiPath: string): Builder<FileOutput> {
  return of(new BuilderPending(context.tsConfig + apiPath));
}
