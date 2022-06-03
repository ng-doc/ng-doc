import * as path from 'path';
import {Observable} from 'rxjs';
import {finalize, mapTo} from 'rxjs/operators';
import {Node, ObjectLiteralExpression, SourceFile, Symbol, SyntaxKind} from 'ts-morph';

import {asArray} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {NgDocBuildableStore} from '../buildable-store';
import {NgDocWatcher} from '../watcher';

/**
 * Base buildable class that all buildables should extend.
 */
export abstract class NgDocBuildable<P extends NgDocBuildable = any, C extends NgDocBuildable = any> {
	/**
	 * The children of the buildable.
	 * Contains all children of the current buildable.
	 */
	readonly children: Set<C> = new Set();

	/** Indicates when current buildable could be built */
	protected readyToBuild: boolean = false;

	protected constructor(
		protected readonly context: NgDocBuilderContext,
		protected readonly buildables: NgDocBuildableStore,
		protected readonly sourceFile: SourceFile,
	) {}

	/**
	 * Indicates when it's root buildable and should be used for rooted components.
	 */
	abstract readonly isRoot: boolean;

	/**
	 * Collection of all file dependencies of the current buildable.
	 * This property is using to watch for changes in this dependencies list and rebuild current buildable.
	 */
	abstract readonly dependencies: string[];

	/**
	 * Should return the parent of the current buildable
	 */
	abstract readonly parent: P | undefined;

	/**
	 * Path to the sourceFileFolder in generated files.
	 */
	abstract readonly folderPathInGenerated: string;

	/**
	 * Should return the list of the dependencies that have to be built if current buildable was changed.
	 */
	abstract readonly buildCandidates: NgDocBuildable[];

	/**
	 * Indicates when current buildable is using for page navigation.
	 */
	abstract readonly isNavigationItem: boolean;

	/**
	 * Emits source files to the cache, if it needs for the update;
	 * This method runs before `update` method
	 */
	abstract emit(): Observable<void>;

	/**
	 * Updates current buildable state from the cache.
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
	 * Recursively returns parents for the current buildable
	 *
	 * @type {Array<NgDocBuildable>}
	 */
	get parentBuildables(): Array<NgDocBuildable<P, C>> {
		return [this.parent ?? [], this.parent?.parentBuildables ?? []].flat();
	}

	/**
	 * Recursively returns children for the current buildable
	 *
	 * @type {Array<NgDocBuildable>}
	 */
	get childBuildables(): Array<NgDocBuildable<P, C>> {
		return [
			...this.children,
			...asArray(this.children)
				.map((child: NgDocBuildable<P, C>) => child.childBuildables)
				.flat(),
		];
	}

	get navigationItems(): Array<NgDocBuildable<P, C>> {
		return this.childBuildables.filter((child: NgDocBuildable<P, C>) => child.isNavigationItem);
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
	 * Should emit buildable that needs to be re-build
	 *
	 * @type {Observable<NgDocBuildable>}
	 */
	get needToRebuild(): Observable<NgDocBuildable<P, C>> {
		const watcher: NgDocWatcher = new NgDocWatcher(this.dependencies);

		return watcher.update.pipe(
			mapTo(this),
			finalize(() => watcher.close()),
		);
	}

	/**
	 * Should return if this buildable is ready to build
	 * Using for build process to skip buildables that is not ready for build
	 *
	 * @type {boolean}
	 */
	get isReadyToBuild(): boolean {
		return this.readyToBuild;
	}

	/**
	 * Returns `SourceFile` for the current buildable
	 *
	 * @type {SourceFile}
	 */
	getSourceFile(): SourceFile {
		return this.sourceFile;
	}

	/**
	 * Adds child to the current buildable
	 *
	 * @type {void}
	 */
	addChild(child: C): void {
		this.children.add(child);
	}

	/**
	 * Removes child from the current buildable
	 *
	 * @type {void}
	 */
	removeChild(child: C): void {
		this.children.delete(child);
	}

	/**
	 * Destroys current buildable and clear all references
	 *
	 * @type {void}
	 */
	destroy(): void {
		this.parent?.removeChild(this);
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
