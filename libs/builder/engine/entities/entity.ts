import * as path from 'path';
import {EMPTY, Observable} from 'rxjs';
import {finalize, mapTo, switchMap} from 'rxjs/operators';
import {Node, ObjectLiteralExpression, SourceFile, Symbol, SyntaxKind} from 'ts-morph';

import {ObservableSet} from '../../classes';
import {asArray} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {NgDocEntityStore} from '../entity-store';
import {NgDocWatcher} from '../watcher';

/**
 * Base entity class that all entities should extend.
 */
export abstract class NgDocEntity {
	/**
	 * Collection of all file dependencies of the current entity.
	 * This property is using to watch for changes in this dependencies list and rebuild current buildable.
	 */
	readonly dependencies: ObservableSet<string> = new ObservableSet<string>();
	/**
	 * The children of the entity.
	 * Contains all children of the current entity.
	 */
	readonly children: Set<NgDocEntity> = new Set();

	/** Indicates when current entity could be built */
	protected readyToBuild: boolean = false;

	protected constructor(
		protected readonly context: NgDocBuilderContext,
		protected readonly entityStore: NgDocEntityStore,
		protected readonly sourceFile: SourceFile,
	) {}

	/**
	 * Indicates when it's root entity and should be used for rooted components.
	 */
	abstract readonly isRoot: boolean;

	/**
	 * Should return the parent of the current entity
	 */
	abstract readonly parent: NgDocEntity | undefined;

	/**
	 * Path to the sourceFileFolder in generated files.
	 */
	abstract readonly folderPathInGenerated: string;

	/**
	 * Should return the list of the dependencies that have to be built if current entity was changed.
	 */
	abstract readonly buildCandidates: NgDocEntity[];

	/**
	 * Indicates when current entity is using for page navigation.
	 */
	abstract readonly isNavigable: boolean;

	/**
	 * Emits source files to the cache, if it needs for the update;
	 * This method runs before `update` method
	 */
	abstract emit(): Observable<void>;

	/**
	 * Updates current entity state from the cache.
	 * This method runs after `emit` method
	 */
	abstract update(): void;

	/**
	 * Build all artifacts that need for application.
	 * This is the last method in the build process, should return output that should be emitted to the file system
	 */
	abstract build(): Observable<NgDocBuildedOutput[]>;

	/**
	 * Returns the sourceFilePath to the source file
	 *
	 * @type {string}
	 */
	get sourceFilePath(): string {
		return this.sourceFile.getFilePath();
	}

	/**
	 * Returns relative path to a sourceFileFolder of the source file
	 *
	 * @type {string}
	 */
	get sourceFileFolder(): string {
		return path.relative(this.context.context.workspaceRoot, path.dirname(this.sourceFilePath));
	}

	/**
	 * Recursively returns parents for the current entity
	 *
	 * @type {Array<NgDocEntity>}
	 */
	get parentEntities(): NgDocEntity[] {
		return [this.parent ?? [], this.parent?.parentEntities ?? []].flat();
	}

	/**
	 * Recursively returns children for the current entity
	 *
	 * @type {Array<NgDocEntity>}
	 */
	get childEntities(): NgDocEntity[] {
		return [
			...this.children,
			...asArray(this.children)
				.map((child: NgDocEntity) => child.childEntities)
				.flat(),
		];
	}

	/**
	 * Returns children of the current buildable that are using for page navigation
	 *
	 * @type {NgDocEntity[]}
	 */
	get navigationItems(): NgDocEntity[] {
		return this.childEntities.filter((child: NgDocEntity) => child.isNavigable);
	}

	/**
	 * Returns `true` if current has children
	 *
	 * @type {boolean}
	 */
	get hasChildren(): boolean {
		return this.children.size > 0;
	}

	/**
	 * Should emit entity that needs to be re-build
	 *
	 * @type {Observable<NgDocEntity>}
	 */
	get needToRebuild(): Observable<NgDocEntity> {
		return this.dependencies.changes().pipe(
			switchMap((deps: string[]) => {
				if (deps.length === 0) {
					return EMPTY;
				}

				const watcher: NgDocWatcher = new NgDocWatcher(deps);

				return watcher.update.pipe(
					mapTo(this),
					finalize(() => watcher.close()),
				);
			}),
		);
	}

	/**
	 * Should return if this entity is ready to build
	 * Using for build process to skip entityStore that is not ready for build
	 *
	 * @type {boolean}
	 */
	get isReadyToBuild(): boolean {
		return this.readyToBuild;
	}

	/**
	 * Returns `SourceFile` for the current entity
	 *
	 * @type {SourceFile}
	 */
	getSourceFile(): SourceFile {
		return this.sourceFile;
	}

	/**
	 * Adds child to the current entity
	 *
	 * @type {void}
	 */
	addChild(child: NgDocEntity): void {
		this.children.add(child);
	}

	/**
	 * Removes child from the current entity
	 *
	 * @type {void}
	 */
	removeChild(child: NgDocEntity): void {
		this.children.delete(child);
	}

	/**
	 * Destroys current entity and clear all references
	 *
	 * @type {void}
	 */
	destroy(): void {
		this.parent?.removeChild(this);
	}

	get builderContext(): NgDocBuilderContext {
		return this.context;
	}

	/**
	 * Returns object expression from default export in the current sourceFile
	 *
	 * @type {ObjectLiteralExpression | undefined}
	 */
	protected getObjectExpressionFromDefault(): ObjectLiteralExpression | undefined {
		const defaultExport: Symbol | undefined = this.sourceFile.getDefaultExportSymbol();
		const exportAlias: Symbol | undefined = defaultExport?.getAliasedSymbol();
		const valueDeclaration: Node | undefined = exportAlias?.getValueDeclarationOrThrow();

		return valueDeclaration?.getFirstChildByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
	}
}
