import {GLOBALS} from '@ng-doc/builder';
import {NgDocCodeType} from '@ng-doc/core';
import * as fs from 'fs';

import {NgDocAsset} from '../interfaces';
import {codeTypeFromExt} from './code-type-from-ext';

/**
 * Builds an asset from a file.
 *
 * @param filePath - The path to the file.
 */
export function buildFileAsset(filePath: string): NgDocAsset {
	const fileContent: string = fs.readFileSync(filePath, 'utf8').trim();
	const codeType: NgDocCodeType = codeTypeFromExt(filePath);

	return {
		title: codeType,
		code: fileContent,
		isEmpty: !fileContent,
		filePath: GLOBALS.relative(filePath),
		lang: codeType,
	};
}
