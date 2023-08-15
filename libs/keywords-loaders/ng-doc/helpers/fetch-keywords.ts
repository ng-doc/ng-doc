import {NgDocKeyword} from '@ng-doc/core';
import fetch, {Response} from 'node-fetch';

/**
 *
 * @param endpoint
 */
export async function fetchKeywords(endpoint: string): Promise<Record<string, NgDocKeyword>> {
	return await fetch(`${endpoint}/keywords.json`).then(
		(response: Response) => response.json() as Promise<Record<string, NgDocKeyword>>,
	);
}
