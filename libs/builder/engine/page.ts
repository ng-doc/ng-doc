import * as fs from 'fs';
import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {isPresent, uniqueName} from '../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext, NgDocPage} from '../interfaces';
import {NgDocPageEnv, NgDocPageModuleEnv} from '../templates-env';
import {NgDocActions} from './actions';
import {NgDocBuildable} from './buildable';
import {NgDocBuildableStore} from './buildable-store';
import {NgDocRenderer} from './renderer';
import {RENDERED_PAGE_NAME} from './variables';

export class NgDocPagePoint extends NgDocBuildable<NgDocPage> {
	moduleName: string = uniqueName(`NgDocGeneratedPageModule`);
	componentName: string = uniqueName(`NgDocGeneratedPageComponent`);

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

	get title(): string {
		return this.compiled?.title ?? '';
	}

	get scope(): string {
		return this.compiled?.scope ?? this.parent?.scope ?? this.context.context.workspaceRoot;
	}

	get moduleFileName(): string {
		return `ng-doc-page.module.ts`;
	}

	get mdPath(): string {
		return path.join(this.folder, this.compiled?.mdFile ?? '');
	}

	get builtPagePath(): string {
		return path.relative(this.context.context.workspaceRoot, path.join(this.generatedPath, RENDERED_PAGE_NAME));
	}

	get dependencies(): string[] {
		return [this.mdPath];
	}

	override update(): void {
		try {
			super.update();

			if (!isPresent(this.compiled?.mdFile) || !fs.existsSync(this.mdPath)) {
				throw new Error(
					`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you define mdFile property correctly and .md file exists.`,
				);
			}
		} catch (error: unknown) {
			this.readyToBuild = false;
			this.context.context.logger.error(`\n${String(error)}`);
		}
	}

	build(): Observable<NgDocBuildedOutput[]> {
		return this.isReadyToBuild ? forkJoin([this.buildPage(), this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		if (this.compiled) {
			const renderer: NgDocRenderer<NgDocPageModuleEnv> = new NgDocRenderer<NgDocPageModuleEnv>({page: this});

			return renderer
				.render('ng-doc.page.module.ts.nunj')
				.pipe(map((output: string) => ({output, filePath: this.modulePath})));
		}
		return of();
	}

	private buildPage(): Observable<NgDocBuildedOutput> {
		if (this.compiled) {
			const renderer: NgDocRenderer<NgDocPageEnv> = new NgDocRenderer<NgDocPageEnv>({
				ngDoc: {
					page: this.compiled,
				},
				ngDocActions: new NgDocActions(this),
			});

			return renderer
				.render(this.mdPath, {scope: this.scope})
				.pipe(map((output: string) => ({output, filePath: this.builtPagePath})));
		}
		return of();
	}
}
