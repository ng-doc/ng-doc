import {NgDocDemoAsset} from '@ng-doc/core';
import {NgDocCodeType, NgDocStyleType} from '@ng-doc/core';
import * as fs from 'fs';

import {NgDocSnippet} from '../interfaces/snippet';
import {codeTypeFromExt} from './code-type-from-ext';
import {processSnippets, removeSnippetsInCode} from './process-snippets';

/**
 * Builds an asset from a file.
 *
 * @param {string} filePath The path to the file.
 * @param {NgDocStyleType} styleType The inline style path.
 * @param checkSnippets
 * @returns {NgDocAsset} The array of assets.
 */
export function buildDemoAssets(filePath: string, styleType: NgDocStyleType, checkSnippets?: boolean): NgDocDemoAsset[];
export function buildDemoAssets(filePath: string, styleType: NgDocStyleType, checkSnippets: false): NgDocDemoAsset;
/**
 *
 * @param filePath
 * @param styleType
 * @param checkSnippets
 */
export function buildDemoAssets(
	filePath: string,
	styleType: NgDocStyleType,
	checkSnippets: boolean = true,
): NgDocDemoAsset[] | NgDocDemoAsset {
	try {
		const fileContent: string = fs.readFileSync(filePath, 'utf8').trim();
		const snippets: NgDocSnippet[] = processSnippets(fileContent);
		const codeType: NgDocCodeType = codeTypeFromExt(filePath);

		// If the file contains snippets, we return an asset for each snippet,
		// otherwise we return a single file as an asset.
		if (checkSnippets && snippets.length) {
			return snippets.map((snippet: NgDocSnippet) => ({
				title: snippet.name,
				code: snippet.content,
				codeType:
					snippet.type === 'styles'
						? ['CSS', 'SCSS', 'SASS', 'LESS'].includes(codeType)
							? codeType
							: styleType
						: snippet.type,
				filePath,
			}));
		} else {
			const fileAsset: NgDocDemoAsset = {
				title: codeType,
				code: removeSnippetsInCode(fileContent),
				codeType,
				filePath,
			};

			return checkSnippets ? [fileAsset] : fileAsset;
		}
	} catch (e) {
		throw new Error(`Error while reading file "${filePath}" for demo: ${e}`);
	}
}
