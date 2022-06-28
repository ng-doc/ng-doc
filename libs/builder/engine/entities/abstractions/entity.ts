import {logging} from '@angular-devkit/core';
import * as path from 'path';
import {Observable, of, Subject} from 'rxjs';
import {finalize, mapTo, startWith, switchMap, takeUntil} from 'rxjs/operators';
import {Node, ObjectLiteralExpression, Project, SourceFile, Symbol, SyntaxKind} from 'ts-morph';

import {ObservableSet} from '../../../classes';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../../../interfaces';
import {NgDocEntityStore} from '../../entity-store';
import {NgDocWatcher} from '../../watcher';

/**
 * Base entity class that all entities should extend.
 */
export abstract class NgDocEntity {
	/** Indicates when entity was destroyed */
	destroyed: boolean = false;
	/**
	 * Collection of all file dependencies of the current entity.
	 * This property is using to watch for changes in this dependencies list and rebuild current buildable.
	 */
	readonly dependencies: ObservableSet<string> = new ObservableSet<string>();

	/** Indicates when current entity could be built */
	protected readyToBuild: boolean = false;

	private destroy$: Subject<void> = new Subject<void>();

	protected constructor(
		readonly project: Project,
		readonly sourceFile: SourceFile,
		protected readonly context: NgDocBuilderContext,
		protected readonly entityStore: NgDocEntityStore,
	) {
		this.entityStore.add(this);

		new NgDocWatcher(this.sourceFilePath).remove.pipe(takeUntil(this.destroy$)).subscribe(() => this.destroy());
	}

	/**
	 * Indicates when it's root entity and should be used for rooted components.
	 */
	abstract readonly isRoot: boolean;

	/**
	 * Should return the parent of the current entity
	 */
	abstract readonly parent?: NgDocEntity;

	/**
	 * Path to the sourceFileFolder in generated files.
	 */
	abstract readonly folderPathInGenerated: string;

	/**
	 * Should return the list of the dependencies that have to be built if current entity was changed.
	 */
	abstract readonly buildCandidates: NgDocEntity[];

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

	/**
	 * Recursively returns parents for the current entity
	 *
	 * @type {Array<NgDocEntity>}
	 */
	get parentEntities(): NgDocEntity[] {
		return [this.parent ?? [], this.parent?.parentEntities ?? []].flat();
	}

	/**
	 * The children of the entity.
	 * Contains all children of the current entity.
	 */
	get children(): NgDocEntity[] {
		return this.entityStore.asArray().filter((entity: NgDocEntity) => entity.parent === this);
	}

	/**
	 * Recursively returns children for the current entity
	 *
	 * @type {Array<NgDocEntity>}
	 */
	get childEntities(): NgDocEntity[] {
		return [...this.children, ...this.children.map((child: NgDocEntity) => child.childEntities).flat()];
	}

	/**
	 * Returns `true` if current has children
	 *
	 * @type {boolean}
	 */
	get hasChildren(): boolean {
		return this.children.length > 0;
	}

	/**
	 * Should emit entity that needs to be re-build
	 *
	 * @type {Observable<NgDocEntity>}
	 */
	get needToRebuild(): Observable<NgDocEntity> {
		return this.dependencies.changes().pipe(
			startWith([]),
			switchMap((deps: string[]) => {
				const watcher: NgDocWatcher = new NgDocWatcher([...deps, this.sourceFilePath]);

				return watcher.update.pipe(
					switchMap((filePath: string) => (filePath === this.sourceFilePath ? this.update() : of(this))),
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
		return this.readyToBuild && !this.destroyed;
	}

	get logger(): logging.LoggerApi {
		return this.context.context.logger;
	}

	/** Runs when entity was created */
	abstract init(): Observable<void>;

	/**
	 * Build all artifacts that need for application.
	 * This is the last method in the build process, should return output that should be emitted to the file system
	 */
	abstract build(): Observable<NgDocBuildedOutput[]>;

	/**
	 * Runs when the source file was updated, can be used to refresh target file etc.
	 */
	protected abstract update(): Observable<void>;

	/**
	 * Destroys current entity and clear all references
	 *
	 * @type {void}
	 */
	destroy(): void {
		this.destroyed = true;
		this.entityStore.remove(this);
		this.destroy$.next();
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
