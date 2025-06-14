import { NgDocSearchResult } from '@ng-doc/app/interfaces';
import { Observable } from 'rxjs';

/**
 * Abstract search engine class, that can be used to implement a custom search engine.
 */
export abstract class NgDocSearchEngine {
  abstract search(query: string): Observable<NgDocSearchResult[]>;
}
