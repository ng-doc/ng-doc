import path from 'path';
import {from, Observable} from 'rxjs';
import {mapTo} from 'rxjs/operators';
import {Node, ObjectLiteralExpression, SourceFile, Symbol, SyntaxKind} from 'ts-morph';

import {slash} from '../../../helpers';
import {NgDocBuilderContext} from '../../../interfaces';
import {NgDocBuilder} from '../../builder';
import {CACHE_PATH} from '../../variables';
import {NgDocEntity} from './entity';

export abstract class NgDocSourceFileEntity extends NgDocEntity {
	/**
	 * The key by which the entity will be stored in the store
	 */
	override readonly id: string = this.sourceFilePath;

	/**
	 * Indicates whether the entity's source file can be compiled
	 */
	readonly compilable: boolean = false;

	constructor(
		override readonly builder: NgDocBuilder,
		readonly sourceFile: SourceFile,
		override readonly context: NgDocBuilderContext,
	) {
		super(builder, context);
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

	override emit(): Observable<void> {
		if (!this.destroyed) {
			return from(this.sourceFile.refreshFromFileSystem()).pipe(mapTo(void 0));
		}
		return super.emit();
	}

	override destroy(): void {
		super.destroy();
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
