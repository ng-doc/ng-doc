import * as minimatch from 'minimatch';
import * as path from 'path';
import {Observable, of} from 'rxjs';
import {mapTo, tap} from 'rxjs/operators';
import {SyntaxKind} from 'ts-morph';

import {isCategoryEntity} from '../../../helpers';
import {CACHE_PATH, CATEGORY_PATTERN} from '../../variables';
import {NgDocCategoryEntity} from '../category.entity';
import {NgDocEntity} from './entity';

/**
 * Entity for file end points that generate modules and components.
 */
export abstract class NgDocFileEntity<T> extends NgDocEntity {
	/**
	 * Entity target.
	 */
	target?: T;

	override init(): Observable<void> {
		return this.update();
	}

	protected override update(): Observable<void> {
		return of(null).pipe(
			tap(() => {
				this.sourceFile.refreshFromFileSystemSync();
				this.sourceFile.emitSync();

				const relativePath: string = path.relative(
					this.context.context.workspaceRoot,
					this.sourceFile.getFilePath(),
				);
				const pathToCompiled: string = path.join(CACHE_PATH, relativePath.replace(/\.ts$/, '.js'));

				delete require.cache[require.resolve(pathToCompiled)];
				this.target = require(pathToCompiled).default;

				if (!this.target) {
					throw new Error(
						`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have exported it as default.`,
					);
				}

				this.readyToBuild = true;
			}),
			mapTo(void 0),
		);
	}

	protected getParentFromCategory(): NgDocCategoryEntity | undefined {
		const sourceFilePath: string | undefined = this.getObjectExpressionFromDefault()
			?.getProperty('category')
			?.getChildrenOfKind(SyntaxKind.Identifier)
			?.pop()
			?.getDefinitions()[0]
			?.getSourceFile()
			?.getFilePath();

		if (sourceFilePath && minimatch(sourceFilePath, CATEGORY_PATTERN) && sourceFilePath !== this.sourceFilePath) {
			const parent: NgDocEntity | undefined = this.entityStore.get(
				path.relative(this.context.context.workspaceRoot, sourceFilePath),
			);

			return isCategoryEntity(parent) ? parent : undefined;
		}
		return undefined;
	}
}
