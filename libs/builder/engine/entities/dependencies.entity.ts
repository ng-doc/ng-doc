import {Component} from '@angular/core';
import {asArray, isPresent} from '@ng-doc/core';
import * as path from 'path';
import {Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {
	ClassDeclaration,
	Decorator,
	Expression,
	Node,
	ObjectLiteralElementLike,
	ObjectLiteralExpression,
} from 'ts-morph';

import {buildAssets, formatCode, isPageEntity, slash} from '../../helpers';
import {NgDocAsset, NgDocBuiltOutput} from '../../interfaces';
import {componentDecoratorResolver} from '../../resolvers/component-decorator.resolver';
import {NgDocComponentAssetsEnv} from '../../templates-env';
import {NgDocRenderer} from '../renderer';
import {PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocSourceFileEntity} from './abstractions/source-file.entity';
import {NgDocPageEntity} from './page.entity';

type ComponentAsset = Record<string, NgDocAsset[]>;

export class NgDocDependenciesEntity extends NgDocSourceFileEntity {
	private componentsAssets: ComponentAsset = {};

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
		return path.join(this.folderPath, 'ng-doc.component-assets.ts');
	}

	get componentAssetsImport(): string {
		return slash(
			path.relative(this.context.context.workspaceRoot, path.join(this.folderPath, 'ng-doc.component-assets')),
		);
	}

	protected override build(): Observable<NgDocBuiltOutput[]> {
		if (!this.parent) {
			return of([]);
		}

		this.fillAssets();

		this.dependencies.clear();
		this.dependencies.add(...this.assets.map((asset: NgDocAsset) => asset.originalPath));

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

	override update(): Observable<void> {
		this.readyToBuild = true;

		return of(void 0);
	}

	private fillAssets(): void {
		const objectExpression: ObjectLiteralExpression | undefined = this.getObjectExpressionFromDefault();

		if (objectExpression) {
			const classDeclarations: ClassDeclaration[] = this.getDemoClassDeclarations(objectExpression);

			this.componentsAssets = classDeclarations
				.map((classDeclarations: ClassDeclaration) => this.getComponentAssets(classDeclarations))
				.reduce((acc: ComponentAsset, curr: ComponentAsset) => ({...acc, ...curr}), {});
		}
	}

	private buildComponentAssets(): Observable<NgDocBuiltOutput> {
		const renderer: NgDocRenderer<NgDocComponentAssetsEnv> = new NgDocRenderer<NgDocComponentAssetsEnv>(
			this.builder,
			{
				componentsAssets: this.componentsAssets,
			},
		);

		return renderer
			.render('./component-assets.ts.nunj')
			.pipe(map((output: string) => ({content: output, filePath: this.componentAssetsPath})));
	}

	private getDemoClassDeclarations(objectExpression: ObjectLiteralExpression): ClassDeclaration[] {
		const demoProperty: ObjectLiteralElementLike | undefined = objectExpression.getProperty('demo');

		if (
			demoProperty &&
			(Node.isPropertyAssignment(demoProperty) || Node.isShorthandPropertyAssignment(demoProperty))
		) {
			const initializer: Expression | undefined = demoProperty.getInitializer();

			if (initializer && initializer instanceof ObjectLiteralExpression) {
				return initializer
					.getProperties()
					.map((property: ObjectLiteralElementLike) => property.getType().getSymbol()?.getValueDeclaration())
					.filter(isPresent)
					.filter(Node.isClassDeclaration);
			}
		}

		return [];
	}

	private getComponentAssets(classDeclaration: ClassDeclaration): ComponentAsset {
		const decorator: Decorator | undefined = classDeclaration.getDecorator('Component');
		const decoratorArgument: Node | undefined = decorator?.getArguments()[0];

		if (Node.isObjectLiteralExpression(decoratorArgument)) {
			const decoratorData: Component = componentDecoratorResolver(decoratorArgument);
			const filePath: string = classDeclaration.getSourceFile().getFilePath();
			const fileDir: string = path.dirname(filePath);

			const assets: Array<Omit<NgDocAsset, 'outputPath'>> = [
				...buildAssets(filePath, this.context.inlineStyleLanguage),
				...(decoratorData.templateUrl
					? buildAssets(path.join(fileDir, decoratorData.templateUrl), this.context.inlineStyleLanguage)
					: []),
				...asArray(decoratorData.styleUrls)
					.map((styleUrl: string) =>
						buildAssets(path.join(fileDir, styleUrl), this.context.inlineStyleLanguage),
					)
					.flat(),
			];

			return {
				[classDeclaration.getName() ?? '']: assets.map((asset: Omit<NgDocAsset, 'outputPath'>) => ({
					...asset,
					output: formatCode(asset.output, asset.type),
					outputPath: slash(path.join(this.parent?.assetsFolder ?? this.folderPath, asset.name)),
				})),
			};
		}

		return {};
	}
}
