import { NgDocSearchResult } from '@ng-doc/app/interfaces';
import { Observable } from 'rxjs';

/**
 * Abstract search engine class, that can be used to implement a custom search engine.
 */
export abstract class NgDocSearchEngine {
  /**
   * Searches the documentation.
   * @param query - The text the user typed.
   * @returns The results for the query.
   */
  abstract search(query: string): Observable<NgDocSearchResult[]>;
}
