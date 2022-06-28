import * as path from 'path';
import {Observable, of} from 'rxjs';
import {ExportedDeclarations, Project, SourceFile} from 'ts-morph';

import {isPageEntity} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {NgDocEntityStore} from '../entity-store';
import {PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocPageEntity} from './page.entity';

export class NgDocApiPageEntity extends NgDocEntity {
	constructor(
		override readonly project: Project,
		override readonly sourceFile: SourceFile,
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
		protected readonly declaration: ExportedDeclarations,
	) {
		super(project, sourceFile, context, entityStore);
	}

	get isRoot(): boolean {
		// always false, page dependencies are not rooted
		return false;
	}

	get folderPathInGenerated(): string {
		return this.parent?.folderPathInGenerated || '';
	}

	get buildCandidates(): NgDocEntity[] {
		return [];
	}

	get parent(): NgDocPageEntity | undefined {
		const expectedPath: string = path.join(this.sourceFileFolder, PAGE_NAME);
		const buildable: NgDocEntity | undefined = this.entityStore.get(expectedPath);

		return buildable && isPageEntity(buildable) ? buildable : undefined;
	}

	override init(): Observable<void> {
		return of(void 0);
	}

	protected override update(): Observable<void> {
		return of(void 0);
	}

	build(): Observable<NgDocBuildedOutput[]> {
		return of([]);
	}
}
