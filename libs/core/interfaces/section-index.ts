import {NgDocPageType} from '@ng-doc/core';

export interface NgDocPageSectionIndex {
	breadcrumbs: string;
	title: string;
	section: string;
	content: string;
	pageType: NgDocPageType;
	route: string;
	fragment?: string;
}
