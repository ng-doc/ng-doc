import { NgDocPageSkeleton } from '@ng-doc/app/interfaces';
import { NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';

/**
 * Provides the skeleton components for the page.
 * @param skeleton - The skeleton for the page.
 */
export function providePageSkeleton(skeleton: NgDocPageSkeleton) {
	return [{ provide: NG_DOC_PAGE_SKELETON, useValue: skeleton }];
}
