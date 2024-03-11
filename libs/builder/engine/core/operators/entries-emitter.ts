import { isPresent } from '@ng-doc/core';
import { sync } from 'fast-glob';
import { minimatch } from 'minimatch';
import path from 'path';
import { merge, mergeMap, Observable } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';

import { NgDocBuilderContext } from '../../../interfaces';
import { pageBuilder } from '../../builders';
import { apiListBuilder } from '../../builders/api-list';
import { API_PATTERN, PAGE_PATTERN } from '../../variables';
import { AsyncFileOutput, BuilderState, FileOutput } from '../types';
import { watchFolder } from '../watcher';

/**
 *
 * @param context
 */
export function entriesEmitter(
  context: NgDocBuilderContext,
): Observable<BuilderState<FileOutput | AsyncFileOutput>> {
  const entries = sync([path.join(context.docsPath, PAGE_PATTERN, API_PATTERN)]);

  return watchFolder(context.docsPath, 'create').pipe(
    map((events) => events.map((event) => event.path)),
    startWith(entries),
    map((events) =>
      events
        .map((filePath) => {
          if (minimatch(filePath, PAGE_PATTERN)) {
            return pageBuilder(context, path.resolve(filePath));
          }

          if (minimatch(filePath, API_PATTERN)) {
            return apiListBuilder(context, path.resolve(filePath));
          }

          return null;
        })
        .filter(isPresent),
    ),
    filter((builders) => builders.length > 0),
    mergeMap((builders) => merge(...builders)),
  );
}
