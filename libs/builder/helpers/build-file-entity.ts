import * as esbuild from 'esbuild';
import minimatch from 'minimatch';
import * as path from 'path';
import {ObjectLiteralExpression, SourceFile} from 'ts-morph';

import {CACHE_PATH, PAGE_PATTERN} from '../engine';
import {getObjectExpressionFromDefault} from './typescript';

/**
 *
 * @param sourceFile
 * @param tsconfig
 * @param outbase
 */
export async function buildFileEntity(sourceFile: SourceFile, tsconfig: string, outbase: string): Promise<string> {
	const p: string = path.relative(outbase, sourceFile.getFilePath());
	const outPath: string = path.join(CACHE_PATH, p).replace(/\.ts$/, '.js');

	/**
	 * Remove module, demo and playgrounds properties from the default export
	 * if the file is a page. This is done to prevent compiling the page dependencies
	 * that are not needed for the page inside the bundle.
	 *
	 */
	if (minimatch(p, PAGE_PATTERN)) {
		const objectLiteralExpression: ObjectLiteralExpression | undefined = getObjectExpressionFromDefault(sourceFile);

		if (objectLiteralExpression) {
			// objectLiteralExpression.getProperty('module')?.remove();
			// objectLiteralExpression.getProperty('demo')?.remove();
			// objectLiteralExpression.getProperty('playgrounds')?.remove();
		}
	}

	await esbuild.build({
		stdin: {
			contents: sourceFile.getFullText(),
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
