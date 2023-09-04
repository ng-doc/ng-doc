import { asArray, NgDocApiScope } from '@ng-doc/core';
import * as glob from 'glob';
import { ExportedDeclarations, SourceFile } from 'ts-morph';

import { NgDocApiEntity, NgDocApiPageEntity, NgDocApiScopeEntity } from '../engine';
import { NgDocSupportedDeclarations } from '../types';
import { isSupportedDeclaration } from './is-supported-declaration';

/**
 *
 * @param apiRootEntity
 */
export function generateApiEntities(
	apiRootEntity: NgDocApiEntity,
): Array<NgDocApiScopeEntity | NgDocApiPageEntity> {
	const result: Array<NgDocApiScopeEntity | NgDocApiPageEntity> = [];
	const scopes: Map<string, NgDocApiScopeEntity> = new Map();
	const duplicatesInScope: Map<NgDocApiScopeEntity, Map<string, number>> = new Map();
	const duplicatedDeclarations: Map<
		NgDocApiScopeEntity,
		Set<NgDocSupportedDeclarations>
	> = new Map();

	const paths: string[] =
		apiRootEntity.target?.scopes
			.map((scope: NgDocApiScope) => {
				const scopeEntity: NgDocApiScopeEntity = new NgDocApiScopeEntity(
					apiRootEntity.store,
					apiRootEntity.cache,
					apiRootEntity.context,
					apiRootEntity.sourceFile,
					apiRootEntity,
					scope,
				);
				const files: string[] = asArray(scope.include)
					.map((i: string) =>
						glob.sync(i, {
							ignore: scope.exclude,
							absolute: true,
						}),
					)
					.flat();

				files.forEach((f: string) => scopes.set(f, scopeEntity));

				result.push(scopeEntity);

				return files;
			})
			.flat() ?? [];

	apiRootEntity.sourceFile
		.getProject()
		.addSourceFilesAtPaths(paths)
		.map(
			(sourceFile: SourceFile) =>
				[sourceFile.getFilePath(), sourceFile.getExportedDeclarations()] as [
					string,
					ReadonlyMap<string, ExportedDeclarations[]>,
				],
		)
		.reduce(
			(
				acc: Map<string, Map<string, NgDocSupportedDeclarations[]>>,
				[path, declarations]: [string, ReadonlyMap<string, ExportedDeclarations[]>],
			) => {
				const current: Map<string, NgDocSupportedDeclarations[]> = acc.get(path) ?? new Map();

				declarations.forEach((value: ExportedDeclarations[], key: string) => {
					const existing: NgDocSupportedDeclarations[] | undefined = current.get(key);
					const supported: NgDocSupportedDeclarations[] = value.filter(isSupportedDeclaration);

					existing
						? current.set(key, asArray(new Set(existing.concat(supported))))
						: current.set(key, supported);
				});

				acc.set(path, current);
				return acc;
			},
			new Map(),
		)
		.forEach((declMap: Map<string, NgDocSupportedDeclarations[]>, path: string) => {
			declMap.forEach((declarations: NgDocSupportedDeclarations[], name: string) => {
				declarations.forEach((declaration: NgDocSupportedDeclarations) => {
					const sourceFile: SourceFile = declaration.getSourceFile();
					const scope: NgDocApiScopeEntity | undefined = scopes.get(path);

					if (scope && !duplicatedDeclarations.get(scope)?.has(declaration)) {
						const duplicates: Map<string, number> = duplicatesInScope.get(scope) ?? new Map();
						const count: number = duplicates.get(name) ?? 0;

						const page: NgDocApiPageEntity = new NgDocApiPageEntity(
							apiRootEntity.store,
							apiRootEntity.cache,
							apiRootEntity.context,
							sourceFile,
							scope,
							name,
							count,
						);

						duplicates.set(name, count + 1);
						duplicatesInScope.set(scope, duplicates);
						duplicatedDeclarations.set(
							scope,
							duplicatedDeclarations.get(scope)?.add(declaration) ?? new Set([declaration]),
						);

						result.push(page);
					}
				});
			});
		});

	return result;
}
