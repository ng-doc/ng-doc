import {JSDoc} from 'ts-morph';

/**
 *
 * @param docs
 */
export function inlineJsDocs(docs: JSDoc[]): string {
	return docs.map((d: JSDoc) => d.getInnerText()).join(' ');
}
