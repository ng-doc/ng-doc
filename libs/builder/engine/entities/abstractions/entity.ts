import {logging} from '@angular-devkit/core';
import {NgDocBuilder} from '@ng-doc/builder';
import * as path from 'path';
import {Observable, Subject} from 'rxjs';
import {take, tap} from 'rxjs/operators';
import {Node, ObjectLiteralExpression, SourceFile, Symbol, SyntaxKind} from 'ts-morph';

import {ObservableSet} from '../../../classes';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../../../interfaces';

/**
 * Base entity class that all entities should extend.
 */
export abstract class NgDocEntity {
	/** Indicates when entity was destroyed */
	destroyed: boolean = false;

	/** Indicates if the current entity can be build */
	get canBeBuild(): boolean {
		return true;
	}

	/** Last built artifacts */
	artifacts: NgDocBuiltOutput[] = [];

	/**
	 * Collection of all file dependencies of the current entity.
	 * This property is using to watch for changes in this dependencies list and rebuild current buildable.
	 */
	readonly dependencies: ObservableSet<string> = new ObservableSet<string>();

	/** Indicates when current entity could be built */
	protected readyToBuild: boolean = false;

	private destroy$: Subject<void> = new Subject<void>();

	constructor(
		readonly builder: NgDocBuilder,
		readonly sourceFile: SourceFile,
		readonly context: NgDocBuilderContext,
		readonly storeAdditionalKey?: string,
	) {}

	/**
	 * The key by which the entity will be stored in the store
	 */
	get id(): string {
		return this.storeAdditionalKey ? `${this.sourceFilePath}#${this.storeAdditionalKey}` : this.sourceFilePath;
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
		return this.builder.asArray().filter((entity: NgDocEntity) => entity.parent === this);
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
	 * Returns `true` if current entity has children
	 *
	 * @type {boolean}
	 */
	get hasChildren(): boolean {
		return this.children.length > 0;
	}

	/**
	 * Should return if this entity is ready to build
	 * Using for build process to skip entityStore that is not ready for build
	 *
	 * @type {boolean}
	 */
	get isReadyToBuild(): boolean {
		return this.readyToBuild && !this.destroyed && this.canBeBuild;
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
	protected abstract build(): Observable<NgDocBuiltOutput[]>;

	/**
	 * Runs when the source file was updated, can be used to refresh target file etc.
	 */
	abstract update(): Observable<void>;

	buildArtifacts(): Observable<NgDocBuiltOutput[]> {
		return this.build().pipe(tap((artifacts: NgDocBuiltOutput[]) => (this.artifacts = artifacts)));
	}

	removeArtifacts(): void {

	}

	/**
	 * Destroys current entity and clear all references
	 *
	 * @type {void}
	 */
	destroy(): void {
		this.readyToBuild = false;
		this.destroyed = true;
		this.destroy$.next();
	}

	onDestroy(): Observable<void> {
		return this.destroy$.asObservable().pipe(take(1))
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
