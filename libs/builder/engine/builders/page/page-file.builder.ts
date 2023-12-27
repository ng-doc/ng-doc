import { NgDocPage } from '@ng-doc/core';
import { merge, takeUntil } from 'rxjs';
import { startWith, tap } from 'rxjs/operators';
import { ObjectLiteralExpression, SourceFile } from 'ts-morph';

import { buildFileEntity, getObjectExpressionFromDefault, importFreshEsm } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, runBuild, watchFile } from '../../core';

interface Config {
	context: NgDocBuilderContext;
	pagePath: string;
}

interface Output {
	page: NgDocPage;
	sourceFile: SourceFile;
	objectExpression: ObjectLiteralExpression;
}

/**
 * A builder function for a page file.
 *
 * This function returns a Builder Observable that emits a NgDocPage object whenever the file at the provided path changes.
 * The Builder Observable is created by merging an Observable that emits on file changes.
 * When the file changes, the build function is called, which compiles the TypeScript file, imports it as an ES module, and returns the default export.
 * @param {NgDocBuilderContext} { tsConfig, project, context } - The context for the builder, including the TypeScript configuration, the project, and the workspace root.
 * @param {string} path - The path of the file to build.
 * @returns {Builder<NgDocPage>} - A Builder Observable that emits a NgDocPage object whenever the file at the provided path changes.
 */
export function pageFileBuilder({
	context: { tsConfig, context, project },
	pagePath,
}: Config): Builder<Output> {
	const sourceFile = project.addSourceFileAtPath(pagePath);

	return merge(watchFile(pagePath, 'update')).pipe(
		tap(() => sourceFile.refreshFromFileSystem()),
		startWith(void 0),
		runBuild(async () => {
			const outPath = await buildFileEntity(sourceFile, tsConfig, context.workspaceRoot);
			const objectExpression = getObjectExpressionFromDefault(sourceFile);

			if (!objectExpression) {
				throw new Error(
					`No object expression found in ${pagePath}, make sure the file has a default export.`,
				);
			}

			return {
				page: (await importFreshEsm<{ default: NgDocPage }>(outPath)).default,
				sourceFile,
				objectExpression,
			};
		}),
		takeUntil(watchFile(pagePath, 'delete')),
	);
}
