import {NgDocPageIndex} from '@ng-doc/core/interfaces';
import {NgDocHighlightPosition} from '@ng-doc/ui-kit';

/**
 * Results of a search query.
 */
export interface NgDocSearchResult {
	/**
	 * Index that was found.
	 */
	index: NgDocPageIndex;
	/**
	 * Positions of the found terms.
	 */
	positions: Partial<Record<keyof NgDocPageIndex, NgDocHighlightPosition[]>>;
}
