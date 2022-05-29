import {SyntaxKind} from '@ts-morph/common';
import * as minimatch from 'minimatch';
import * as path from 'path';
import {Node, ObjectLiteralExpression, SourceFile, Symbol} from 'ts-morph';

import {capitalize} from '../helpers';
import {NgDocBuilderContext} from '../interfaces';
import {CACHE_PATH, GENERATED_MODULES_PATH, PAGE_PATTERN} from './variables';

export abstract class NgDocBuildable<T = any> {
	readonly children: Set<NgDocBuildable> = new Set();
	protected compiled?: T;

	protected constructor(
		protected readonly context: NgDocBuilderContext,
		protected readonly buildables: Map<string, NgDocBuildable>,
		protected readonly sourceFile: SourceFile,
	) {}

	abstract route: string;
	abstract isRoot: boolean;
	abstract scope: string;
	abstract moduleFileName: string;
	abstract moduleName: string;

	abstract build(): Promise<void>;

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

		if (sourceFilePath && minimatch(sourceFilePath, PAGE_PATTERN) && sourceFilePath !== this.path) {
			return this.buildables.get(path.relative(this.context.context.workspaceRoot, sourceFilePath));
		}
		return undefined;
	}

	get parentDependencies(): NgDocBuildable[] {
		return [...(this.parent?.parentDependencies ?? [])];
	}

	get hasChildren(): boolean {
		return this.children.size > 0;
	}

	get generatedPath(): string {
		return path.join(this.parent?.generatedPath ?? GENERATED_MODULES_PATH, this.route);
	}

	get modulePath(): string {
		const relativePath: string = path.relative(this.context.context.workspaceRoot, this.generatedPath);

		return path.join(relativePath, this.moduleFileName).replace(/.ts$/, '');
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
