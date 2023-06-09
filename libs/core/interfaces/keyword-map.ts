import {NgDocKeywordType} from '../types';

export interface NgDocKeyword {
	title: string;
	path: string;
	description?: string;
	type?: NgDocKeywordType;
	isCodeLink: boolean;
}

/**
 * Global keyword configuration.
 */
export interface NgDocGlobalKeyword {
	/**
	 * Keyword title that will be displayed in the link.
	 * If not provided, the keyword will be displayed as is.
	 */
	title?: string;
	/**
	 * Url that will be used to generate the link.
	 */
	url: string;
	/**
	 * Description that will be displayed in a tooltip on hover.
	 */
	description?: string;
	/**
	 * Determines whether the keyword is a code link.
	 */
	isCodeLink?: boolean;
}
