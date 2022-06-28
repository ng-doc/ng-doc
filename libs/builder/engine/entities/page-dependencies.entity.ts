import {Component} from '@angular/core';
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
	Project,
	SourceFile,
} from 'ts-morph';

import {asArray, buildAssets, formatCode, isPageEntity, isPresent} from '../../helpers';
import {NgDocAsset, NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {componentDecoratorResolver} from '../../resolvers/component-decorator.resolver';
import {NgDocComponentAssetsEnv} from '../../templates-env';
import {NgDocEntityStore} from '../entity-store';
import {NgDocRenderer} from '../renderer';
import {PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocPageEntity} from './page.entity';

type ComponentAsset = Record<string, NgDocAsset[]>;

export class NgDocPageDependenciesEntity extends NgDocEntity {
	private componentsAssets: ComponentAsset = {};

	constructor(
		override readonly project: Project,
		override readonly sourceFile: SourceFile,
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
	) {
		super(project, sourceFile, context, entityStore);
	}

	override get storeKey(): string {
		return this.sourceFilePath;
	}

	override get isRoot(): boolean {
		// always false, page dependencies are not rooted
		return false;
	}

	override get folderPathInGenerated(): string {
		return this.parent?.folderPathInGenerated || '';
	}

	override get buildCandidates(): NgDocEntity[] {
		return [];
	}

	override get parent(): NgDocPageEntity | undefined {
		const expectedPath: string = path.join(this.sourceFileFolder, PAGE_NAME);
		const buildable: NgDocEntity | undefined = this.entityStore.get(expectedPath);

		return buildable && isPageEntity(buildable) ? buildable : undefined;
	}

	get assets(): NgDocAsset[] {
		return Object.keys(this.componentsAssets)
			.map((key: string) => this.componentsAssets[key])
			.flat();
	}

	get componentAssetsInGenerated(): string {
		return path.join(this.folderPathInGenerated, 'ng-doc.component-assets.ts');
	}

	get componentAssetsInGeneratedImport(): string {
		return path.join(this.folderPathInGenerated, 'ng-doc.component-assets');
	}

	override init(): Observable<void> {
		/*
			We don't want to emit current source file, because it may be depended on project's files,
			so it may take too much time, the fastest way is to parse source file.
		 */
		return this.update();
	}

	override build(): Observable<NgDocBuildedOutput[]> {
		this.dependencies.clear();
		this.fillAssets();
		this.dependencies.add(...this.assets.map((asset: NgDocAsset) => asset.originalPath));

		return this.buildComponentAssets().pipe(
			map((output: NgDocBuildedOutput) => [
				output,
				...this.assets.map((asset: NgDocAsset) => ({
					output: asset.output,
					filePath: asset.outputPath,
				})),
			]),
		);
	}

	protected override update(): Observable<void> {
		this.fillAssets();

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

	private buildComponentAssets(): Observable<NgDocBuildedOutput> {
		const renderer: NgDocRenderer<NgDocComponentAssetsEnv> = new NgDocRenderer<NgDocComponentAssetsEnv>({
			componentsAssets: this.componentsAssets,
		});

		return renderer
			.render('component-assets.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: this.componentAssetsInGenerated})));
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
					outputPath: path.join(this.parent?.assetsFolder ?? this.folderPathInGenerated, asset.name),
				})),
			};
		}

		return {};
	}
}
