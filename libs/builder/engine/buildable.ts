import {SyntaxKind} from '@ts-morph/common';
import * as minimatch from 'minimatch';
import * as path from 'path';
import {Observable, Subject} from 'rxjs';
import {finalize, mapTo, switchMap} from 'rxjs/operators';
import {Node, ObjectLiteralExpression, SourceFile, Symbol} from 'ts-morph';

import {asArray, capitalize, isPagePoint} from '../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../interfaces';
import {NgDocBuildableStore} from './buildable-store';
import {NgDocPagePoint} from './page';
import {CACHE_PATH, CATEGORY_PATTERN, GENERATED_MODULES_PATH} from './variables';
import {NgDocWatcher} from './watcher';

export abstract class NgDocBuildable<T = any> {
	readonly children: Set<NgDocBuildable> = new Set();
	protected compiled?: T;
	private updated$: Subject<void> = new Subject();

	protected constructor(
		protected readonly context: NgDocBuilderContext,
		protected readonly buildables: NgDocBuildableStore,
		protected readonly sourceFile: SourceFile,
	) {}

	abstract route: string;
	abstract isRoot: boolean;
	abstract scope: string;
	abstract moduleFileName: string;
	abstract moduleName: string;
	abstract dependencies: string[];

	abstract build(): Observable<NgDocBuildedOutput[]>;

	get url(): string {
		return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
	}

	get name(): string {
		return capitalize(this.route);
	}

	get path(): string {
		return this.sourceFile.getFilePath();
	}

	get folder(): string {
		return path.relative(this.context.context.workspaceRoot, path.dirname(this.path));
	}

	get parent(): NgDocBuildable | undefined {
		const sourceFilePath: string | undefined = this.getExpression()
			?.getProperty('category')
			?.getChildrenOfKind(SyntaxKind.Identifier)
			?.pop()
			?.getDefinitions()[0]
			?.getSourceFile()
			?.getFilePath();

		if (sourceFilePath && minimatch(sourceFilePath, CATEGORY_PATTERN) && sourceFilePath !== this.path) {
			return this.buildables.get(path.relative(this.context.context.workspaceRoot, sourceFilePath));
		}
		return undefined;
	}

	get parentDependencies(): NgDocBuildable[] {
		return [this.parent ?? [], this.parent?.parentDependencies ?? []].flat();
	}

	get childDependencies(): NgDocBuildable[] {
		return [
			...this.children,
			...asArray(this.children)
				.map((child: NgDocBuildable) => child.childDependencies)
				.flat(),
		];
	}

	get hasChildren(): boolean {
		return this.children.size > 0;
	}

	get generatedPath(): string {
		return path.join(this.parent?.generatedPath ?? GENERATED_MODULES_PATH, this.route);
	}

	get modulePath(): string {
		return path.join(this.generatedPath, this.moduleFileName);
	}

	get moduleImportPath(): string {
		return path.relative(this.context.context.workspaceRoot, this.modulePath).replace(/.ts$/, '');
	}

	get needToRebuild(): Observable<NgDocBuildable> {
		const watcher: NgDocWatcher = new NgDocWatcher(this.dependencies);

		return this.updated$.pipe(
			switchMap(() => watcher.update),
			mapTo(this),
			finalize(() => watcher.close()),
		);
	}

	addChild(child: NgDocBuildable): void {
		this.children.add(child);
	}

	removeChild(child: NgDocBuildable): void {
		this.children.delete(child);
	}

	update(): void {
		const relativePath: string = path.relative(this.context.context.workspaceRoot, this.sourceFile.getFilePath());
		const pathToCompiled: string = path.join(CACHE_PATH, relativePath.replace(/\.ts$/, '.js'));

		delete require.cache[require.resolve(pathToCompiled)];
		this.compiled = require(pathToCompiled).default;

		this.parent?.addChild(this);
		this.updated$.next();
	}

	destroy(): void {
		this.parent?.removeChild(this);
	}

	private getExpression(): ObjectLiteralExpression | undefined {
		const defaultExport: Symbol | undefined = this.sourceFile.getDefaultExportSymbol();
		const exportAlias: Symbol | undefined = defaultExport?.getAliasedSymbol();
		const valueDeclaration: Node | undefined = exportAlias?.getValueDeclarationOrThrow();

		return valueDeclaration?.getFirstChildByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
	}
}
