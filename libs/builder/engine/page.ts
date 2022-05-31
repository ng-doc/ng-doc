import * as path from 'path';
import {forkJoin, from, Observable, of} from 'rxjs';
import {concatAll, map, mapTo} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {uniqueName} from '../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext, NgDocPage} from '../interfaces';
import {NgDocPageEnv, NgDocPageModuleEnv} from '../templates-env';
import {NgDocActions} from './actions';
import {NgDocBuildable} from './buildable';
import {NgDocBuildableStore} from './buildable-store';
import {NgDocRenderer} from './renderer';
import {GENERATED_PATH, RENDERED_PAGE_NAME} from './variables';

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

	build(): Observable<NgDocBuildedOutput[]> {
		return forkJoin([this.buildPage(), this.buildModule()]);
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
