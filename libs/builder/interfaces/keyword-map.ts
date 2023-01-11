import {NgDocKindType, NgDocPageType} from '@ng-doc/core';

import {NgDocKeywordType} from '../types';

export interface NgDocKeyword {
	title: string;
	path: string;
	type?: NgDocKeywordType;
	isCodeLink: boolean;
}

export interface NgDocGlobalKeyword {
	title?: string;
	path: string;
	isCodeLink?: boolean;
}
