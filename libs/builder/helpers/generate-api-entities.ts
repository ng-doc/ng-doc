import {asArray, NgDocApiScope} from '@ng-doc/core';
import * as glob from 'glob';
import {ExportedDeclarations, SourceFile} from 'ts-morph';

import {NgDocApiEntity, NgDocApiPageEntity, NgDocApiScopeEntity} from '../engine';
import {NgDocSupportedDeclarations} from '../types';
import {isSupportedDeclaration} from './is-supported-declaration';

/**
 *
 * @param apiRootEntity
 */
export function generateApiEntities(apiRootEntity: NgDocApiEntity): Array<NgDocApiScopeEntity | NgDocApiPageEntity> {
	const result: Array<NgDocApiScopeEntity | NgDocApiPageEntity> = [];
	const scopes: Map<string, NgDocApiScopeEntity> = new Map();
	const duplicatesInScope: Map<NgDocApiScopeEntity, Map<string, number>> = new Map();

	const paths: string[] =
		apiRootEntity.target?.scopes
			.map((scope: NgDocApiScope) => {
				const scopeEntity: NgDocApiScopeEntity = new NgDocApiScopeEntity(
					apiRootEntity.builder,
					apiRootEntity.sourceFile,
					apiRootEntity.context,
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

	apiRootEntity.builder.project
		.addSourceFilesAtPaths(paths)
		.map((sourceFile: SourceFile) => sourceFile.getExportedDeclarations())
		.reduce(
			(acc: Map<string, NgDocSupportedDeclarations[]>, declarations: ReadonlyMap<string, ExportedDeclarations[]>) => {
				declarations.forEach((value: ExportedDeclarations[], key: string) => {
					const existing: NgDocSupportedDeclarations[] | undefined = acc.get(key);
					const supported: NgDocSupportedDeclarations[] = value.filter(isSupportedDeclaration);

					existing ? acc.set(key, asArray(new Set(existing.concat(supported)))) : acc.set(key, supported);
				});

				return acc;
			},
			new Map(),
		)
		.forEach((declarations: NgDocSupportedDeclarations[], name: string) => {
			declarations.forEach((declaration: NgDocSupportedDeclarations) => {
				const sourceFile: SourceFile = declaration.getSourceFile();
				const scope: NgDocApiScopeEntity | undefined = scopes.get(sourceFile.getFilePath());

				if (scope) {
					const duplicates: Map<string, number> = duplicatesInScope.get(scope) ?? new Map();
					const count: number = duplicates.get(name) ?? 0;

					const page: NgDocApiPageEntity = new NgDocApiPageEntity(
						apiRootEntity.builder,
						sourceFile,
						apiRootEntity.context,
						scope,
						name,
						count,
					);

					duplicates.set(name, count + 1);
					duplicatesInScope.set(scope, duplicates);

					result.push(page);
				}
			});
		});

	return result;
}
