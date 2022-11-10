import {NgDocApiEntity, NgDocApiPageEntity, NgDocApiScopeEntity} from '../engine';
import {NgDocApiScope} from '../interfaces';
import * as glob from 'glob';
import {isNotExcludedPath} from './is-not-excluded-path';
import {SourceFile} from 'ts-morph';
import {isSupportedDeclaration} from './is-supported-declaration';
import {NgDocSupportedDeclarations} from '../types';
import {asArray} from '@ng-doc/core';

export function generateApiEntities(apiRootEntity: NgDocApiEntity): Array<NgDocApiScopeEntity | NgDocApiPageEntity> {
	const result: Array<NgDocApiScopeEntity | NgDocApiPageEntity> = []

	apiRootEntity.target?.scopes.forEach((scope: NgDocApiScope) => {
		const scopeEntity: NgDocApiScopeEntity = new NgDocApiScopeEntity(apiRootEntity.builder, apiRootEntity.sourceFile, apiRootEntity.context, apiRootEntity, scope);

		result.push(scopeEntity);

		asArray(scope.include).forEach((include: string) =>
			asArray(
				new Set(
					apiRootEntity.sourceFile.getProject()
						.addSourceFilesAtPaths(
							glob
								.sync(include)
								.filter((p: string) => isNotExcludedPath(p, asArray(scope.exclude))),
						)
						.map((sourceFile: SourceFile) => asArray(sourceFile.getExportedDeclarations().values()))
						.flat(2),
				),
			)
				.filter(isSupportedDeclaration)
				.forEach((declaration: NgDocSupportedDeclarations) => {
					const name: string | undefined = declaration.getName();

					if (name) {
						result.push(
							new NgDocApiPageEntity(
								apiRootEntity.builder,
								declaration.getSourceFile(),
								apiRootEntity.context,
								scopeEntity,
								name,
							)
						)
					}
				}),
		);
		}
	);

	return result;
}
