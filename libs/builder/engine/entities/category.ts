import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {asArray, isCategoryEntity, isPageEntity, uniqueName} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext, NgDocCategory} from '../../interfaces';
import {NgDocCategoryModuleEnv} from '../../templates-env';
import {NgDocEntityStore} from '../entity-store';
import {NgDocRenderer} from '../renderer';
import {CACHE_PATH} from '../variables';
import {NgDocAngularEntity} from './angular-entity';
import {NgDocEntity} from './entity';
import {NgDocPageEntity} from './page';

export class NgDocCategoryPoint extends NgDocAngularEntity<NgDocCategory> {
	moduleName: string = uniqueName(`NgDocGeneratedCategoryModule`);

	constructor(
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
		protected override readonly sourceFile: SourceFile,
	) {
		super(context, entityStore, sourceFile);
	}

	get route(): string {
		const folderName: string = path.basename(path.dirname(this.sourceFile.getFilePath()));

		return this.compiled?.route ?? folderName;
	}

	get isRoot(): boolean {
		return !this.compiled?.category;
	}

	get scope(): string {
		return (
			this.compiled?.scope?.replace(CACHE_PATH, '') ?? this.parent?.scope ?? this.context.context.workspaceRoot
		);
	}

	get order(): number | undefined {
		return this.compiled?.order;
	}

	get pages(): NgDocPageEntity[] {
		return asArray(this.children.values()).filter(isPageEntity);
	}

	get categories(): NgDocCategoryPoint[] {
		return asArray(this.children.values()).filter(isCategoryEntity);
	}

	get moduleFileName(): string {
		return `ng-doc-category.module.ts`;
	}

	get title(): string {
		return this.compiled?.title ?? '';
	}

	get buildCandidates(): NgDocEntity[] {
		return this.childEntities;
	}

	get expandable(): boolean {
		return this.compiled?.expandable ?? true;
	}

	get expanded(): boolean {
		return this.compiled?.expanded ?? !this.isRoot;
	}

	override update(): void {
		try {
			super.update();
			this.parent?.addChild(this);
		} catch (error: unknown) {
			this.readyToBuild = false;
			this.context.context.logger.error(`\n${String(error)}`);
		}
	}

	build(): Observable<NgDocBuildedOutput[]> {
		return this.isReadyToBuild ? forkJoin([this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		if (this.compiled) {
			const renderer: NgDocRenderer<NgDocCategoryModuleEnv> = new NgDocRenderer<NgDocCategoryModuleEnv>({
				category: this,
			});

			return renderer
				.render('ng-doc.category.module.ts.nunj')
				.pipe(map((output: string) => ({output, filePath: this.modulePathInGenerated})));
		}
		return of();
	}
}
