import { merge } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput } from '../../core';
import { contextBuilder, routesBuilder } from './context-and-routes.builder';
import { indexBuilder } from './index.builder';
import { keywordsBuilder } from './keywords.builder';
import { searchIndexesBuilder } from './search-indexes.builder';

/**
 *
 * @param context
 */
export function globalBuilders(context: NgDocBuilderContext): Builder<FileOutput> {
  return merge(
    indexBuilder(context),
    searchIndexesBuilder(context),
    keywordsBuilder(context),
    routesBuilder(context),
    contextBuilder(context),
  );
}
