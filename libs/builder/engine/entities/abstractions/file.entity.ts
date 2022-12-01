import * as fs from 'fs';
import minimatch from 'minimatch';
import * as path from 'path';
import {Observable, of, throwError} from 'rxjs';
import {OutputFile, SyntaxKind} from 'ts-morph';

import {isCategoryEntity} from '../../../helpers';
import {CACHE_PATH, CATEGORY_PATTERN} from '../../variables';
import {NgDocCategoryEntity} from '../category.entity';
import {NgDocEntity} from './entity';
import {NgDocSourceFileEntity} from './source-file.entity';

/**
 * Entity for file end points that generate modules and components.
 */
export abstract class NgDocFileEntity<T> extends NgDocSourceFileEntity {
	/**
	 * Entity target.
	 */
	target?: T;

	get pathToCompiledFile(): string {
		const relativePath: string = path.relative(this.context.context.workspaceRoot, this.sourceFile.getFilePath());

		return path.join(CACHE_PATH, relativePath.replace(/\.ts$/, '.js'));
	}

	override init(): Observable<void> {
		return this.update();
	}

	override update(): Observable<void> {
		this.readyToBuild = false;

		delete require.cache[require.resolve(this.pathToCompiledFile)];
		this.target = require(this.pathToCompiledFile).default;

		if (!this.target) {
			return throwError(
				new Error(
					`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have exported it as default.`,
				)
			)
		}

		this.readyToBuild = true;

		return of(void 0)
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
			const parent: NgDocEntity | undefined = this.builder.get(
				path.relative(this.context.context.workspaceRoot, sourceFilePath),
			);

			return isCategoryEntity(parent) ? parent : undefined;
		}
		return undefined;
	}

	override destroy(): void {
		super.destroy();
	}

	override removeArtifacts() {
		super.removeArtifacts();

		this.sourceFile.getEmitOutput().getOutputFiles().forEach((file: OutputFile) => {
			fs.existsSync(file.getFilePath()) && fs.unlinkSync(file.getFilePath());
		})
	}
}
