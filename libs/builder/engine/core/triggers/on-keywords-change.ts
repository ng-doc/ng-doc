import { Observable, Subject } from 'rxjs';
import { debounceTime, filter, map } from 'rxjs/operators';

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
    debounceTime(0),
    map(() => void 0),
  );
}

/**
 *
 * @param {...any} keywords
 */
export function triggerKeywordsChange(...keywords: Array<Set<string>>): void {
  KEYWORDS_CHANGE.next(Array.from(new Set(keywords.map((k) => Array.from(k)).flat())));
}
