import {NgDocPageType} from '@ng-doc/core';

export interface NgDocPageSectionIndex {
	breadcrumbs: string;
	title: string;
	sectionTitle: string;
	content: string;
	pageType: NgDocPageType;
	route: string;
}
