import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

const KEYWORDS_CHANGE = new Subject<string[]>();

/**
 *
 * @param {...any} keywords
 */
export function onKeywordsChange(...keywords: Array<Set<string>>): Observable<void> {
  return KEYWORDS_CHANGE.pipe(
    filter((changedKeywords) => {
      return keywords.some((k) => changedKeywords.some((c) => k.has(c)));
    }),
    map(() => void 0),
  );
}

/**
 *
 * @param {...any} keywords
 */
export function triggerKeywordsChange(...keywords: string[]): void {
  KEYWORDS_CHANGE.next(keywords);
}
