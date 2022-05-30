import * as path from 'path';
import {SourceFile} from 'ts-morph';

import {uniqueName} from '../helpers';
import {NgDocBuilderContext, NgDocPage} from '../interfaces';
import {NgDocPageEnv, NgDocPageModuleEnv} from '../templates-env';
import {NgDocActions} from './actions';
import {NgDocBuildable} from './buildable';
import {NgDocRenderer} from './renderer';
import {RENDERED_PAGE_NAME} from './variables';

export class NgDocPagePoint extends NgDocBuildable<NgDocPage> {
	moduleName: string = uniqueName(`NgDocGeneratedPageModule`);
	componentName: string = uniqueName(`NgDocGeneratedPageComponent`);

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

	async build(): Promise<void> {
		await Promise.all([this.buildModule(), this.buildPage()]);
	}

	private async buildModule(): Promise<void> {
		if (this.compiled) {
			const renderer: NgDocRenderer<NgDocPageModuleEnv> = new NgDocRenderer<NgDocPageModuleEnv>({page: this});

			await renderer.renderToFile(
				'ng-doc.page.module.ts.nunj',
				path.join(this.generatedPath, this.moduleFileName),
			);
		}
	}

	private async buildPage(): Promise<void> {
		if (this.compiled) {
			const renderer: NgDocRenderer<NgDocPageEnv> = new NgDocRenderer<NgDocPageEnv>({
				ngDoc: {
					page: this.compiled,
				},
				ngDocActions: new NgDocActions(this),
			});

			await renderer.renderToFile(this.mdPath, this.builtPagePath, {scope: this.scope});
		}
	}
}
