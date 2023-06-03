import path from 'path';
import {forkJoin, Observable} from 'rxjs';
import {mapTo, tap} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {slash} from '../../../helpers';
import {NgDocBuilderContext} from '../../../interfaces';
import {NgDocEntityStore} from '../../entity-store';
import {CACHE_PATH} from '../../variables';
import {NgDocCache} from '../cache';
import {NgDocEntity} from './entity';

export abstract class NgDocSourceFileEntity extends NgDocEntity {
	/**
	 * The key by which the entity will be stored in the store
	 */
	override readonly id: string = this.sourceFilePath;

	constructor(
		override readonly store: NgDocEntityStore,
		override readonly cache: NgDocCache,
		override readonly context: NgDocBuilderContext,
		readonly sourceFile: SourceFile,
	) {
		super(store, cache, context);
	}
	/**
	 * Files that are watched for changes to rebuild entity or remove it
	 */
	override get rootFiles(): string[] {
		return [this.sourceFilePath];
	}

	get sourceFilePath(): string {
		return path.relative(this.context.context.workspaceRoot, this.sourceFile.getFilePath());
	}

	/**
	 * Returns relative path to a sourceFileFolder of the source file
	 *
	 * @type {string}
	 */
	get sourceFileFolder(): string {
		return path.relative(this.context.context.workspaceRoot, path.dirname(this.sourceFilePath));
	}

	get importPath(): string {
		return slash(this.sourceFilePath.replace(/.ts$/, ''));
	}

	/**
	 * Returns import paths that can be used to import the current source file
	 */
	get pathToCompiledFile(): string {
		const relativePath: string = path.relative(this.context.context.workspaceRoot, this.sourceFile.getFilePath());

		return path.join(CACHE_PATH, relativePath.replace(/\.ts$/, '.js'));
	}

	/**
	 * Runs when the source file was updated, can be used refresh source file in the typescript project
	 */
	protected refreshImpl(): Observable<void> {
		return forkJoin(
			[this.sourceFile, ...this.sourceFile.getReferencedSourceFiles()].map((sourceFile: SourceFile) =>
				sourceFile.refreshFromFileSystem(),
			),
		).pipe(mapTo(void 0));
	}

	refresh(): Observable<void> {
		// Reset warnings and errors because it's the first step of the build process
		this.warnings = [];
		this.errors = [];

		return this.refreshImpl().pipe(
			tap({
				error: (e: Error) => this.errors.push(e),
			}),
		);
	}

	override destroy(): void {
		super.destroy();
	}
}
