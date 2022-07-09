import * as path from 'path';
import {forkJoin, Observable, of, throwError} from 'rxjs';
import {map} from 'rxjs/operators';
import {Project, SourceFile} from 'ts-morph';

import {isPageEntity, uniqueName} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext, NgDocPlayground} from '../../interfaces';
import {NgDocPlaygroundModuleEnv} from '../../templates-env';
import {NgDocEntityStore} from '../entity-store';
import {NgDocRenderer} from '../renderer';
import {PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocModuleEntity} from './abstractions/module.entity';
import {NgDocPageEntity} from './page.entity';

export class NgDocPlaygroundEntity extends NgDocModuleEntity<NgDocPlayground> {
	override folderName: string = '';
	override isRoot: boolean = false;
	override moduleName: string = uniqueName(`NgDocGeneratedPlaygroundModule`);
	override moduleFileName: string = `ng-doc-playground.module.ts`;
	override buildCandidates: NgDocEntity[] = [];

	constructor(
		override readonly project: Project,
		override readonly sourceFile: SourceFile,
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
	) {
		super(project, sourceFile, context, entityStore);
	}

	override get parent(): NgDocPageEntity | undefined {
		const expectedPath: string = path.join(this.sourceFileFolder, PAGE_NAME);
		const buildable: NgDocEntity | undefined = this.entityStore.get(expectedPath);

		return buildable && isPageEntity(buildable) ? buildable : undefined;
	}

	build(): Observable<NgDocBuildedOutput[]> {
		return this.isReadyToBuild ? forkJoin([this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		if (!this.target) {
			return throwError('Target for NgDocPlaygroundEntity was not defined.');
		}

		const renderer: NgDocRenderer<NgDocPlaygroundModuleEnv> = new NgDocRenderer<NgDocPlaygroundModuleEnv>({
			playground: this,
		});

		return renderer
			.render('playground.module.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: this.modulePath})));
	}
}
