import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {asArray, isCategoryPoint, isPagePoint, uniqueName} from '../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext, NgDocCategory} from '../interfaces';
import {NgDocCategoryModuleEnv} from '../templates-env';
import {NgDocBuildable} from './buildable';
import {NgDocBuildableStore} from './buildable-store';
import {NgDocPagePoint} from './page';
import {NgDocRenderer} from './renderer';

export class NgDocCategoryPoint extends NgDocBuildable<NgDocCategory> {
	moduleName: string = uniqueName(`NgDocGeneratedCategoryModule`);

	constructor(
		protected override readonly context: NgDocBuilderContext,
		protected override readonly buildables: NgDocBuildableStore,
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

	get dependencies(): string[] {
		return [];
	}

	build(): Observable<NgDocBuildedOutput[]> {
		return forkJoin([this.buildModule()]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		if (this.compiled) {
			const renderer: NgDocRenderer<NgDocCategoryModuleEnv> = new NgDocRenderer<NgDocCategoryModuleEnv>({
				category: this,
			});

			return renderer
				.render('ng-doc.category.module.ts.nunj')
				.pipe(map((output: string) => ({output, filePath: this.modulePath})));
		}
		return of();
	}
}
