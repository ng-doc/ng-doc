import {
	NgDocBuilderContext,
	NgDocComponentAsset,
	postProcessHtmlJob,
	processHtmlJob,
	renderTemplate,
	runBuild,
} from '@ng-doc/builder';
import * as path from 'path';
import { merge } from 'rxjs';
import { debounceTime, startWith, tap } from 'rxjs/operators';
import { ObjectLiteralExpression } from 'ts-morph';

import { getDemoAssets, getDemoClassDeclarations } from '../../../helpers';
import { Builder, FileOutput, watchFile } from '../../core';

/**
 * Options for the demoAssetsBuilder function.
 */
interface Options {
	context: NgDocBuilderContext;
	objectExpression: ObjectLiteralExpression;
	outDir: string;
}

/**
 * Builds demo assets for a given context, object expression, and output directory.
 * @param {Options} options - The options for the builder.
 * @returns {Builder<FileOutput>} A builder that outputs file outputs.
 */
export function demoAssetsBuilder({
	context,
	objectExpression,
	outDir,
}: Options): Builder<FileOutput> {
	const references = Object.values(getDemoClassDeclarations(objectExpression)).map(
		(classDeclaration) => classDeclaration.getSourceFile(),
	);

	const potentialKeywords = new Set<string>();
	const usedKeywords = new Set<string>();

	return merge(
		...references.map((sourceFile) => watchFile(sourceFile.getFilePath(), 'update')),
	).pipe(
		debounceTime(0),
		tap(() => {
			references.forEach((sourceFile) => {
				sourceFile.refreshFromFileSystemSync();
			});
		}),
		startWith(void 0),
		runBuild(async () => {
			const classDeclarations = getDemoClassDeclarations(objectExpression);

			const demoAssets: NgDocComponentAsset = Object.keys(classDeclarations).reduce(
				(acc: NgDocComponentAsset, key: string) =>
					Object.assign(acc, {
						[key]: getDemoAssets(classDeclarations[key], context.inlineStyleLanguage),
					}),
				{},
			);

			for (const [, value] of Object.entries(demoAssets)) {
				for (const asset of value) {
					asset.code = await processHtmlJob({ addAnchor: () => {} })(asset.code);
					asset.code = await postProcessHtmlJob({
						addUsedKeyword: usedKeywords.add.bind(usedKeywords),
						addPotentialKeyword: potentialKeywords.add.bind(potentialKeywords),
					})(asset.code);
				}
			}

			return {
				filePath: path.join(outDir, 'demo-assets.ts'),
				content: renderTemplate('./demo-assets.ts.nunj', { context: { demoAssets } }),
			};
		}),
	);
}
