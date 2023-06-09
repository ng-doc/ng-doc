import {NgDocKeyword} from '@ng-doc/core';

/**
 *
 * @param endpoint
 */
export async function fetchKeywords(endpoint: string): Promise<Record<string, NgDocKeyword>> {
	return await fetch(`${endpoint}/keywords.json`).then((response: Response) => response.json());
}
