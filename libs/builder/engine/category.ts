import * as path from 'path';
import {SourceFile} from 'ts-morph';

import {asArray, isCategoryPoint, isPagePoint, uniqueName} from '../helpers';
import {NgDocBuilderContext, NgDocCategory} from '../interfaces';
import {NgDocCategoryModuleEnv} from '../templates-env';
import {NgDocBuildable} from './buildable';
import {NgDocPagePoint} from './page';
import {NgDocRenderer} from './renderer';

export class NgDocCategoryPoint extends NgDocBuildable<NgDocCategory> {
	moduleName: string = uniqueName(`NgDocGeneratedCategoryModule`);

	constructor(
		protected override readonly context: NgDocBuilderContext,
		protected override readonly buildables: Map<string, NgDocBuildable>,
		protected override readonly sourceFile: SourceFile,
	) {
		super(context, buildables, sourceFile);
	}

	get route(): string {
		const folderName: string = path.basename(path.dirname(this.sourceFile.getFilePath()));

		return this.compiled?.route ?? folderName;
	}

	get isRoot(): boolean {
		return !this.compiled?.category;
	}

	get scope(): string {
		return this.compiled?.scope ?? this.parent?.scope ?? this.context.context.workspaceRoot;
	}

	get pages(): NgDocPagePoint[] {
		return asArray(this.children.values()).filter(isPagePoint);
	}

	get categories(): NgDocCategoryPoint[] {
		return asArray(this.children.values()).filter(isCategoryPoint);
	}

	get moduleFileName(): string {
		return `ng-doc-category.module.ts`;
	}

	get title(): string {
		return this.compiled?.title ?? '';
	}

	async build(): Promise<void> {
		await this.buildModule();
	}

	override update() {
		super.update();
		this.rebuildDependencies();
	}

	private async buildModule(): Promise<void> {
		if (this.compiled) {
			const renderer: NgDocRenderer<NgDocCategoryModuleEnv> = new NgDocRenderer<NgDocCategoryModuleEnv>({
				category: this,
			});

			await renderer.renderToFile(
				'ng-doc.category.module.ts.nunj',
				path.join(this.generatedPath, this.moduleFileName),
			);
		}
	}
}
