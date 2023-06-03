import {minimatch} from 'minimatch';
import * as path from 'path';
import {Observable, of} from 'rxjs';
import {ObjectLiteralExpression, SyntaxKind} from 'ts-morph';

import {getObjectExpressionFromDefault, isCategoryEntity} from '../../../helpers';
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

	protected override loadImpl(): Observable<void> {
		delete require.cache[require.resolve(this.pathToCompiledFile)];
		this.target = require(this.pathToCompiledFile).default;
		this.objectExpression = getObjectExpressionFromDefault(this.sourceFile);

		if (!this.target || !this.objectExpression) {
			new Error(`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have exported it as default.`);
		}

		return of(void 0);
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

	override destroy(): void {
		super.destroy();
	}

	override removeArtifacts() {
		super.removeArtifacts();
	}
}
