import path from 'path';
import {Node, ObjectLiteralExpression, SourceFile, Symbol, SyntaxKind} from 'ts-morph';

import {NgDocBuilderContext} from '../../../interfaces';
import {NgDocBuilder} from '../../builder';
import {NgDocEntity} from './entity';

export abstract class NgDocSourceFileEntity extends NgDocEntity {
	/**
	 * The key by which the entity will be stored in the store
	 */
	override readonly id: string = this.sourceFilePath;

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

	override emit(): void {
		if (!this.destroyed) {
			this.sourceFile.refreshFromFileSystemSync();
			this.sourceFile.emitSync();
		}
	}

	override destroy(): void {
		super.destroy();
		this.sourceFile.forget();
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
