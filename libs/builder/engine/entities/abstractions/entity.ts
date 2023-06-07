import {logging} from '@angular-devkit/core';
import {NgDocPageIndex} from '@ng-doc/core';
import {Observable, of, Subject} from 'rxjs';
import {take, tap} from 'rxjs/operators';

import {ObservableSet} from '../../../classes';
import {NgDocBuilderContext, NgDocBuildOutput} from '../../../interfaces';
import {NgDocEntityStore} from '../../entity-store';
import {NgDocCache} from '../cache';
import {CachedFilesGetter, CachedProperty} from '../cache/decorators';

/**
 * Base entity class that all entities should extend.
 */
export abstract class NgDocEntity {
	/**
	 * The key by which the entity will be stored in the store
	 */
	abstract readonly id: string;

	/** Indicates when entity was destroyed */
	destroyed: boolean = false;

	/** Search indexes for the current entity */
	@CachedProperty()
	indexes: NgDocPageIndex[] = [];

	/**
	 * List of keywords that were linked to the entity
	 */
	@CachedProperty({
		get: (value: string[]) => new Set<string>(value),
		set: (value: Set<string>) => Array.from(value),
	})
	usedKeywords: Set<string> = new Set<string>();

	/**
	 * List of potential keywords that are used by the entity but not linked yet
	 * (they will be sat by Keywords Processor, and used to indicate when this entity should be re-build if one of them appears)
	 */
	@CachedProperty({
		get: (value: string[]) => new Set<string>(value),
		set: (value: Set<string>) => Array.from(value),
	})
	potentialKeywords: Set<string> = new Set<string>();

	/**
	 * Collection of all file dependencies of the current entity.
	 * This property is using to watch for changes in this dependencies list and rebuild current buildable.
	 */
	readonly dependencies: ObservableSet<string> = new ObservableSet<string>();

	/**
	 * Indicates if this entity has physical file in file system
	 * If this entity was generated by another Entity, this property should be `false`
	 *
	 * NgDoc destroys all child elements of non-physical entities when they are destroyed
	 */
	readonly physical: boolean = true;

	/**
	 * List of errors that were occurred during the build process
	 */
	errors: Error[] = [];

	/**
	 * List of warnings that were occurred during the build process
	 */
	warnings: Error[] = [];

	private destroy$: Subject<void> = new Subject<void>();

	/**
	 * Files that are watched for changes to rebuild entity or remove it
	 */
	abstract readonly rootFiles: string[];

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

	constructor(readonly store: NgDocEntityStore, readonly cache: NgDocCache, readonly context: NgDocBuilderContext) {}

	/** Indicates when current entity could be built */
	protected get canBeBuilt(): boolean {
		return true;
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
		return this.store.asArray().filter((entity: NgDocEntity) => entity.parent === this && !entity.destroyed);
	}

	/**
	 * Returns children that are ready to build or already built
	 */
	get builtChildren(): NgDocEntity[] {
		return this.children.filter((entity: NgDocEntity) => entity.isReadyForBuild);
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
	 *
	 * @type {boolean}
	 */
	get isReadyForBuild(): boolean {
		return !this.destroyed && !this.errors.length && this.canBeBuilt;
	}

	get logger(): logging.LoggerApi {
		return this.context.context.logger;
	}

	@CachedFilesGetter()
	get cachedFilePaths(): string[] {
		return this.rootFiles.concat(this.dependencies.asArray());
	}

	/**
	 * Build all artifacts that need for application.
	 * This is the last method in the build process, should return output that should be emitted to the file system
	 */
	protected abstract buildImpl(): Observable<NgDocBuildOutput[]>;

	/**
	 * Method called by NgDocBuilder when one or more dependencies have changed
	 */
	dependenciesChanged(): void {
		// Reset error and warnings, because dependency changes could fix them
		this.warnings = [];
		this.errors = [];
	}

	childrenGenerator(): Observable<NgDocEntity[]> {
		return of([]);
	}

	build(): Observable<NgDocBuildOutput[]> {
		// Clear all indexes and used keywords before build
		this.usedKeywords.clear();
		this.potentialKeywords.clear();
		this.indexes = [];

		return this.buildImpl().pipe(
			tap({
				error: (e: Error) => this.errors.push(e),
			}),
		);
	}

	updateCache(): void {
		this.cache.cache(this);
	}

	removeArtifacts(): void {
		// No implementation
	}

	/**
	 * Destroys current entity and clear all references
	 *
	 * @type {void}
	 */
	destroy(): void {
		this.children.forEach((entity: NgDocEntity) => !entity.physical && entity.destroy());

		this.destroyed = true;
		this.destroy$.next();
	}

	onDestroy(): Observable<void> {
		return this.destroy$.asObservable().pipe(take(1));
	}
}
