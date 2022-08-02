import {NgDocPageType} from '@ng-doc/core';

export interface NgDocPageIndex {
	route: string;
	title: string;
	type: NgDocPageType;
	heading: string;
	content: string;
	kind?: string;
}
