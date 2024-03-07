import { asyncScheduler, Observable, Subject, subscribeOn } from 'rxjs';
import { filter, map } from 'rxjs/operators';

const KEYWORDS_CHANGE = new Subject<string[]>();

/**
 *
 * @param {...any} keywords
 */
export function onKeywordsTouch(...keywords: Array<Set<string>>): Observable<void> {
  return KEYWORDS_CHANGE.pipe(
    filter((changedKeywords) => {
      return keywords.some((k) => changedKeywords.some((c) => k.has(c)));
    }),
    map(() => void 0),
    subscribeOn(asyncScheduler),
  );
}

/**
 *
 * @param {...any} keywords
 */
export function touchKeywords(...keywords: string[]): void {
  KEYWORDS_CHANGE.next(keywords);
}
