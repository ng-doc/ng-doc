import {Node, ObjectLiteralExpression, SourceFile, Symbol} from 'ts-morph';
import * as path from 'path';
import * as minimatch from 'minimatch';
import {CACHE_PATH, ENTRY_POINT_PATTERN, GENERATED_MODULES_PATH, RENDERED_PAGE_NAME} from './variables';
import {SyntaxKind} from '@ts-morph/common';
import {NgDocRenderer} from './renderer';
import {NgDocPageEnv, NgDocRouteEnv} from './templates-env';
import {NgDocActions} from './actions';
import {NgDocBuilderContext, NgDocPage} from './interfaces';

let id = 0;

export class NgDocEntryPoint {
	public readonly children: Set<NgDocEntryPoint> = new Set();
	private entryPointId: number = id++;
	private compiledEntryPoint?: NgDocPage;

	constructor(
		private readonly context: NgDocBuilderContext,
		private readonly entryPoints: Map<string, NgDocEntryPoint>,
		private readonly sourceFile: SourceFile,
	) {}

	get route(): string {
		const folderName: string = path.basename(path.dirname(this.sourceFile.getFilePath()));

		return this.compiledEntryPoint?.route ?? folderName;
	}

	get isRootRoute(): boolean {
		return !this.compiledEntryPoint?.category || typeof this.compiledEntryPoint.category === 'string';
	}

	get parentPage(): NgDocEntryPoint | undefined {
		const sourceFilePath: string | undefined = this.getPageExpression()
			.getProperty('category')
			?.getChildrenOfKind(SyntaxKind.Identifier)
			?.pop()
			?.getDefinitions()[0]
			?.getSourceFile()
			?.getFilePath();

		if (sourceFilePath && minimatch(sourceFilePath, ENTRY_POINT_PATTERN) && sourceFilePath !== this.path) {
			return this.entryPoints.get(path.relative(this.context.context.workspaceRoot, sourceFilePath));
		}
		return undefined;
	}

	get path(): string {
		return this.sourceFile.getFilePath();
	}

	get folder(): string {
		return path.relative(this.context.context.workspaceRoot, path.dirname(this.path));
	}

	get category(): string | undefined {
		return typeof this.compiledEntryPoint?.category === 'string' ? this.compiledEntryPoint?.category : undefined;
	}

	get title(): string {
		return this.compiledEntryPoint?.title ?? '';
	}

	get scope(): string {
		return this.compiledEntryPoint?.scope ?? this.context.context.workspaceRoot;
	}

	get moduleName(): string {
		return `NgDoc${this.entryPointId}Module`;
	}

	get componentName(): string {
		return `NgDoc${this.entryPointId}Component`;
	}

	get moduleFileName(): string {
		return `ng-doc-${this.entryPointId}.module.ts`;
	}

	get moduleFolder(): string {
		return path.join(GENERATED_MODULES_PATH, this.entryPointId.toString());
	}

	get modulePath(): string {
		const relativePath: string = path.relative(this.context.context.workspaceRoot, this.moduleFolder);

		return path.join(relativePath, this.moduleFileName).replace(/.ts$/, '');
	}

	get mdPath(): string {
		return path.join(this.folder, this.compiledEntryPoint?.mdFile ?? '');
	}

	get renderedPagePath(): string {
		return path.relative(this.context.context.workspaceRoot, path.join(this.moduleFolder, RENDERED_PAGE_NAME));
	}

	get hasChildren(): boolean {
		return this.children.size > 0;
	}

	update(): void {
		const relativePath: string = path.relative(this.context.context.workspaceRoot, this.sourceFile.getFilePath());
		const pathToCompiled: string = path.join(CACHE_PATH, relativePath.replace(/\.ts$/, '.js'));

		delete require.cache[require.resolve(pathToCompiled)];
		this.compiledEntryPoint = require(pathToCompiled).default;

		this.parentPage?.addChild(this);
	}

	addChild(child: NgDocEntryPoint): void {
		this.children.add(child);
	}

	removeChild(child: NgDocEntryPoint): void {
		this.children.delete(child);
	}

	async renderModule(): Promise<void> {
		const renderer: NgDocRenderer = new NgDocRenderer<NgDocRouteEnv>({
			entryPoint: this,
		});

		await renderer.renderToFile('ng-doc.page.module.ts.ejs', path.join(this.moduleFolder, this.moduleFileName));
	}

	async renderPage(): Promise<void> {
		if (this.compiledEntryPoint) {
			const renderer: NgDocRenderer = new NgDocRenderer<NgDocPageEnv>({
				ngDoc: {
					page: this.compiledEntryPoint,
				},
				ngDocActions: new NgDocActions(this),
			});

			await renderer.renderToFile(this.mdPath, this.renderedPagePath, {fullPath: true});
		}
	}

	destroy(): void {
		this.parentPage?.removeChild(this);
	}

	private getPageExpression(): ObjectLiteralExpression {
		const defaultExport: Symbol = this.sourceFile.getDefaultExportSymbol()!;
		const exportAlias: Symbol = defaultExport.getAliasedSymbol()!;
		const valueDeclaration: Node = exportAlias.getValueDeclarationOrThrow();

		return valueDeclaration.getFirstChildByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
	}
}
