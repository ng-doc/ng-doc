import {
	createImportPath,
	NgDocPlaygroundMetadata,
	PAGE_NAME,
	renderTemplate,
	runBuild,
} from '@ng-doc/builder';
import { NgDocPage, NgDocPlaygroundControlConfig, NgDocPlaygroundProperties } from '@ng-doc/core';
import * as path from 'path';
import { merge } from 'rxjs';
import { debounceTime, startWith, tap } from 'rxjs/operators';
import { ObjectLiteralExpression } from 'ts-morph';

import {
	buildPlaygroundMetadata,
	getDemoClassDeclarations,
	getPlaygroundById,
	getPlaygroundsExpression,
	getPlaygroundsIds,
} from '../../../helpers';
import { Builder, FileOutput, watchFile } from '../../core';

interface Options {
	objectExpression: ObjectLiteralExpression;
	page: NgDocPage;
	dir: string;
	outDir: string;
}

/**
 *
 * @param root0
 * @param root0.objectExpression
 * @param root0.context
 * @param root0.outDir
 * @param root0.page
 * @param root0.dir
 */
export function playgroundBuilder({
	objectExpression,
	page,
	dir,
	outDir,
}: Options): Builder<FileOutput> {
	const references = Object.values(getDemoClassDeclarations(objectExpression)).map(
		(classDeclaration) => classDeclaration.getSourceFile(),
	);
	const outPath = path.join(outDir, 'playgrounds.ts');

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
			const metadata = getMetadata(page, objectExpression);

			return {
				filePath: outPath,
				content: renderTemplate('./playgrounds.ts.nunj', {
					context: {
						playgroundMetadata: metadata,
						hasImports: !!objectExpression?.getProperty('imports'),
						entryImportPath: createImportPath(outDir, path.join(dir, PAGE_NAME)),
					},
				}),
			};
		}),
	);
}

/**
 *
 * @param page
 * @param objectExpression
 */
function getMetadata(
	page: NgDocPage,
	objectExpression: ObjectLiteralExpression,
): Record<string, NgDocPlaygroundMetadata> {
	const expression = getPlaygroundsExpression(objectExpression);

	if (expression) {
		return getPlaygroundsIds(expression).reduce(
			(metadata: Record<string, NgDocPlaygroundMetadata>, id: string) => {
				if (expression) {
					const playground: ObjectLiteralExpression | undefined = getPlaygroundById(expression, id);

					if (playground) {
						metadata[id] = buildPlaygroundMetadata(
							id,
							playground,
							controlsToProperties(page.playgrounds?.[id]?.controls ?? {}),
						);
					}
				}
				return metadata;
			},
			{},
		);
	}

	return {};
}

/**
 *
 * @param controls
 */
function controlsToProperties(
	controls: Record<string, string | NgDocPlaygroundControlConfig>,
): NgDocPlaygroundProperties {
	return Object.entries(controls).reduce(
		(
			properties: NgDocPlaygroundProperties,
			[name, value]: [string, string | NgDocPlaygroundControlConfig],
		) => {
			properties[name] = {
				inputName: typeof value === 'string' ? name : value.alias ?? name,
				type: typeof value === 'string' ? value : value.type,
				description: typeof value === 'string' ? undefined : value.description ?? undefined,
				options: typeof value === 'string' ? undefined : value.options ?? undefined,
			};

			return properties;
		},
		{},
	);
}
