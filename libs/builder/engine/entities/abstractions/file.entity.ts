import {minimatch} from 'minimatch';
import * as path from 'path';
import {defer, from, Observable, of} from 'rxjs';
import {map, tap} from 'rxjs/operators';
import {ObjectLiteralExpression, SyntaxKind} from 'ts-morph';

import {buildFileEntity, getObjectExpressionFromDefault, isCategoryEntity} from '../../../helpers';
import {CATEGORY_PATTERN} from '../../variables';
import {NgDocCategoryEntity} from '../category.entity';
import {NgDocEntity} from './entity';
import {NgDocSourceFileEntity} from './source-file.entity';

/**
 * Entity for file end points that generate modules and components.
 */
export abstract class NgDocFileEntity<T> extends NgDocSourceFileEntity {
	objectExpression: ObjectLiteralExpression | undefined;
	/**
	 * Entity target.
	 */
	target?: T;

	/**
	 * Runs when the source file was updated, can be used to load target file.
	 */
	protected loadImpl(): Observable<void> {
		return defer(() => {
			delete require.cache[require.resolve(this.pathToCompiledFile)];
			this.target = require(this.pathToCompiledFile).default;
			this.objectExpression = getObjectExpressionFromDefault(this.sourceFile);

			if (!this.target || !this.objectExpression) {
				new Error(`Failed to load object. Make sure that you have exported it as default.`);
			}

			return of(void 0);
		});
	}

	protected getParentFromCategory(): NgDocCategoryEntity | undefined {
		const sourceFilePath: string | undefined = this.objectExpression
			?.getProperty('category')
			?.getChildrenOfKind(SyntaxKind.Identifier)
			?.pop()
			?.getDefinitions()[0]
			?.getSourceFile()
			?.getFilePath();

		if (sourceFilePath && minimatch(sourceFilePath, CATEGORY_PATTERN) && sourceFilePath !== this.sourceFilePath) {
			const parent: NgDocEntity | undefined = this.store.get(
				path.relative(this.context.context.workspaceRoot, sourceFilePath),
			);

			return isCategoryEntity(parent) && parent.isReadyForBuild ? parent : undefined;
		}

		return undefined;
	}

	/**
	 * Compiles the source file
	 */
	compile(): Observable<void> {
		return from(buildFileEntity(this.sourceFile, this.context.tsConfig, this.context.context.workspaceRoot)).pipe(
			map(() => void 0),
			tap({
				error: (e: Error) => this.errors.push(e),
			}),
		);
	}

	load(): Observable<void> {
		return this.loadImpl().pipe(
			tap({
				error: (e: Error) => this.errors.push(e),
			}),
		);
	}

	override destroy(): void {
		super.destroy();
	}

	override removeArtifacts() {
		super.removeArtifacts();
	}
}
