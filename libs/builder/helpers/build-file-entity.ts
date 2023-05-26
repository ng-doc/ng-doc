import {escapeRegexp} from '@ng-doc/core';
import * as esbuild from 'esbuild';
import minimatch from 'minimatch';
import * as path from 'path';
import {ObjectLiteralExpression, SourceFile} from 'ts-morph';

import {CACHE_PATH, PAGE_PATTERN} from '../engine';
import {getObjectExpressionFromDefault} from './typescript';

/**
 * Builds file entity and returns the path to the built file
 *
 * @param sourceFile - source file to build
 * @param tsconfig - path to tsconfig file
 * @param outbase - path to the outbase directory
 */
export async function buildFileEntity(sourceFile: SourceFile, tsconfig: string, outbase: string): Promise<string> {
	let code: string = sourceFile.getFullText();
	const p: string = path.relative(outbase, sourceFile.getFilePath());
	const outPath: string = path.join(CACHE_PATH, p).replace(/\.ts$/, '.js');

	/**
	 * Remove module, demo and playgrounds properties from the default export
	 * if the file is a page. This is done to prevent compiling the page dependencies
	 * that are not needed for the NgDoc builder
	 *
	 */
	if (minimatch(p, PAGE_PATTERN)) {
		const objectLiteralExpression: ObjectLiteralExpression | undefined = getObjectExpressionFromDefault(sourceFile);

		/**
		 * We use regex to remove the properties because ts-morph does it slowly
		 */
		if (objectLiteralExpression) {
			code = replaceCodeProperty(code, objectLiteralExpression.getProperty('module')?.getText() ?? '');
			code = replaceCodeProperty(code, objectLiteralExpression.getProperty('demos')?.getText() ?? '');
			code = replaceCodeProperty(code, objectLiteralExpression.getProperty('playgrounds')?.getText() ?? '');
		}
	}

	await esbuild.build({
		stdin: {
			contents: code,
			resolveDir: path.dirname(p),
			loader: 'ts',
			sourcefile: p,
		},
		tsconfig,
		bundle: true,
		format: 'cjs',
		treeShaking: true,
		outbase,
		outfile: outPath,
	});

	await sourceFile.refreshFromFileSystem();

	return outPath;
}

/**
 *
 * @param code
 * @param property
 */
function replaceCodeProperty(code: string, property: string): string {
	const regex: RegExp = new RegExp(`${escapeRegexp(property)},?`);

	return code.replace(regex, '');
}
