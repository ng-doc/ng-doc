import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { isColdStart } from '../variables';

const KEYWORDS_CHANGE = new Subject<string[]>();

/**
 *
 * @param {...any} keywords
 * @param include
 * @param exclude
 */
export function onKeywordsTouch(
  include: (key: string) => boolean,
  exclude: (key: string) => boolean = () => false,
): Observable<void> {
  return KEYWORDS_CHANGE.pipe(
    filter((changedKeywords) => {
      return !isColdStart() && changedKeywords.some((c) => !exclude(c) && include(c));
    }),
    map(() => void 0),
  );
}

/**
 *
 * @param {...any} keywords
 */
export function touchKeywords(...keywords: string[]): void {
  KEYWORDS_CHANGE.next(keywords);
}
