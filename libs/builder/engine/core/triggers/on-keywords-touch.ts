import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

const KEYWORDS_CHANGE = new Subject<string[]>();

/**
 *
 * @param {...any} keywords
 * @param exclude
 */
export function onKeywordsTouch(
  keywords: Set<string>,
  exclude: (key: string) => boolean = () => false,
): Observable<void> {
  return KEYWORDS_CHANGE.pipe(
    filter((changedKeywords) => {
      return changedKeywords.some((c) => !exclude(c) && keywords.has(c));
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
