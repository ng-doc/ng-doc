import {asArray, isPresent} from '@ng-doc/core';
import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {
	ClassDeclaration,
	Expression,
	Node,
	ObjectLiteralElementLike,
	ObjectLiteralExpression,
	PropertyAssignment,
} from 'ts-morph';

import {
	formatCode,
	getComponentAsset,
	getDemoClassDeclarations, getObjectExpressionFromDefault,
	getTargetForPlayground,
	isPageEntity,
	slash,
} from '../../helpers';
import {NgDocAsset, NgDocBuiltOutput} from '../../interfaces';
import {NgDocComponentAsset} from '../../types';
import {PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocSourceFileEntity} from './abstractions/source-file.entity';
import {NgDocPageEntity} from './page.entity';

export class NgDocDependenciesEntity extends NgDocSourceFileEntity {
	private componentsAssets: NgDocComponentAsset = {};

	override get isRoot(): boolean {
		// always false, page dependencies are not rooted
		return false;
	}

	get folderPath(): string {
		return this.parent?.folderPath || '';
	}

	override get buildCandidates(): NgDocEntity[] {
		return asArray(this.parent);
	}

	/**
	 * The parent of the current entity is always the page entity
	 * that located in the same folder
	 */
	override get parent(): NgDocPageEntity | undefined {
		const expectedPath: string = path.join(this.sourceFileFolder, PAGE_NAME);
		const entity: NgDocEntity | undefined = this.builder.get(expectedPath);

		return entity && isPageEntity(entity) ? entity : undefined;
	}

	get assets(): NgDocAsset[] {
		return Object.keys(this.componentsAssets)
			.map((key: string) => this.componentsAssets[key])
			.flat();
	}

	get componentAssetsPath(): string {
		return path.join(this.folderPath, 'component-assets.ts');
	}

	get componentAssetsImport(): string {
		return slash(path.relative(this.context.context.workspaceRoot, path.join(this.folderPath, 'component-assets')));
	}

	get playgroundsPath(): string {
		return path.join(this.folderPath, 'playgrounds.ts');
	}

	get playgroundIds(): string[] {
		const playgrounds: ObjectLiteralExpression | undefined = this.getPlaygroundsExpression();

		return (
			playgrounds
				?.getProperties()
				.filter(Node.isPropertyAssignment)
				.map((p: PropertyAssignment) => p.getName()) ?? []
		);
	}

	override dependenciesChanged() {
		super.dependenciesChanged();

		this.getTargets().forEach((target: ClassDeclaration) => target.getSourceFile().refreshFromFileSystem());
	}

	override update(): Observable<void> {
		this.fillAssets();

		return of(void 0);
	}

	protected override build(): Observable<NgDocBuiltOutput[]> {
		if (!this.parent) {
			return of([]);
		}
		this.dependencies.clear();

		this.fillAssets();

		this.getTargets().forEach((target: ClassDeclaration) =>
			this.dependencies.add(target.getSourceFile().getFilePath()),
		);

		return forkJoin([this.buildAssets(), this.buildPlaygrounds()]).pipe(
			map(([assets, playgrounds]: [NgDocBuiltOutput[], NgDocBuiltOutput]) => [...assets, playgrounds]),
		);
	}

	getPlaygroundsExpression(): ObjectLiteralExpression | undefined {
		const objectExpression: ObjectLiteralExpression | undefined = getObjectExpressionFromDefault(this.sourceFile);

		if (objectExpression) {
			const property: ObjectLiteralElementLike | undefined = objectExpression.getProperty('playgrounds');

			if (Node.isPropertyAssignment(property)) {
				const value: Expression | undefined = property.getInitializer();

				if (Node.isObjectLiteralExpression(value)) {
					return value;
				}
			}
		}

		return undefined;
	}

	private buildAssets(): Observable<NgDocBuiltOutput[]> {
		return this.buildComponentAssets().pipe(
			map((output: NgDocBuiltOutput) => [
				output,
				...this.assets.map((asset: NgDocAsset) => ({
					content: asset.output,
					filePath: asset.outputPath,
				})),
			]),
		);
	}

	private fillAssets(): void {
		const objectExpression: ObjectLiteralExpression | undefined = getObjectExpressionFromDefault(this.sourceFile);

		if (objectExpression) {
			const classDeclarations: ClassDeclaration[] = getDemoClassDeclarations(objectExpression);

			this.componentsAssets = classDeclarations
				.map((classDeclarations: ClassDeclaration) =>
					getComponentAsset(
						classDeclarations,
						this.context.inlineStyleLanguage,
						this.parent?.assetsFolder ?? this.folderPath,
					),
				)
				.reduce((acc: NgDocComponentAsset, curr: NgDocComponentAsset) => ({...acc, ...curr}), {});

			this.dependencies.add(...this.assets.map((asset: NgDocAsset) => asset.originalPath));
		}
	}

	private getTargets(): ClassDeclaration[] {
		return this.playgroundIds
			.map((pId: string) => {
				const expression: ObjectLiteralExpression | undefined = this.getPlaygroundsExpression();

				return expression && getTargetForPlayground(expression, pId);
			})
			.filter(isPresent);
	}

	private buildComponentAssets(): Observable<NgDocBuiltOutput> {
		return this.builder.renderer
			.render('./component-assets.ts.nunj', {
				context: {
					componentsAssets: this.componentsAssets,
				},
			})
			.pipe(map((output: string) => ({content: output, filePath: this.componentAssetsPath})));
	}

	private buildPlaygrounds(): Observable<NgDocBuiltOutput> {
		return (
			this.builder.renderer
				.render('./playgrounds.ts.nunj', {
					context: {
						dependencies: this,
					},
				})
				// TODO: move format code to the post processor?
				.pipe(
					map((output: string) => ({
						content: formatCode(output, 'TypeScript'),
						filePath: this.playgroundsPath,
					})),
				)
		);
	}
}
