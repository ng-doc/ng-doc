import {NgDocCodeType, NgDocStyleType} from '@ng-doc/core';
import * as fs from 'fs';

import {NgDocAsset} from '../interfaces';
import {NgDocSnippet} from '../interfaces/snippet';
import {codeTypeFromExt} from './code-type-from-ext';
import {processSnippets} from './process-snippets';
import {uniqueName} from './unique-name';

/**
 * Builds an asset from a file.
 *
 * @param {string} filePath The path to the file.
 * @param {NgDocStyleType} styleType The inline style path.
 * @returns {NgDocAsset} The array of assets.
 */
export function buildAssets(filePath: string, styleType: NgDocStyleType): Array<Omit<NgDocAsset, 'outputPath'>> {
	try {
		const fileContent: string = fs.readFileSync(filePath, 'utf8').trim();
		const snippets: NgDocSnippet[] = processSnippets(fileContent);
		const codeType: NgDocCodeType = codeTypeFromExt(filePath);

		// If the file contains snippets, we return an asset for each snippet,
		// otherwise we return a single file as an asset.
		if (snippets.length) {
			return snippets.map((snippet: NgDocSnippet) => ({
				title: snippet.name,
				name: uniqueName('Asset'),
				originalPath: filePath,
				code: snippet.content,
				output: snippet.content,
				type:
					snippet.type === 'styles'
						? ['CSS', 'SCSS', 'SASS', 'LESS'].includes(codeType)
							? codeType
							: styleType
						: snippet.type,
			}));
		} else {
			return [
				{
					title: codeType,
					name: uniqueName('Asset'),
					originalPath: filePath,
					code: fileContent,
					output: fileContent,
					type: codeType,
				},
			];
		}
	} catch (e) {
		console.error(e);
	}
	return [];
}
