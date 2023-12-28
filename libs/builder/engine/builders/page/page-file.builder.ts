import { createEntryMetadata } from '@ng-doc/builder';
import { NgDocPage } from '@ng-doc/core';
import { merge, takeUntil } from 'rxjs';
import { startWith, tap } from 'rxjs/operators';

import { buildFileEntity, importFreshEsm } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, runBuild, watchFile } from '../../core';
import { EntryMetadata } from '../interfaces';

interface Config {
	context: NgDocBuilderContext;
	pagePath: string;
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
export function pageFileBuilder({ context, pagePath }: Config): Builder<EntryMetadata<NgDocPage>> {
	const sourceFile = context.project.addSourceFileAtPath(pagePath);

	return merge(watchFile(pagePath, 'update')).pipe(
		tap(() => sourceFile.refreshFromFileSystem()),
		startWith(void 0),
		runBuild(async () => {
			const outPath = await buildFileEntity(
				sourceFile,
				context.tsConfig,
				context.context.workspaceRoot,
			);
			const page = (await importFreshEsm<{ default: NgDocPage }>(outPath)).default;

			return createEntryMetadata(context, page, sourceFile);
		}),
		takeUntil(watchFile(pagePath, 'delete')),
	);
}
