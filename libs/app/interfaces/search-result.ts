import {NgDocPageSectionIndex} from '@ng-doc/core/interfaces';
import {NgDocHighlightPosition} from '@ng-doc/ui-kit';

/**
 * Results of a search query.
 */
export interface NgDocSearchResult {
	/**
	 * Index that was found.
	 */
	index: NgDocPageSectionIndex;
	/**
	 * Positions of the found terms.
	 */
	positions: Partial<Record<keyof NgDocPageSectionIndex, NgDocHighlightPosition[]>>;
}
