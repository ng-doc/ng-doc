import * as path from 'path';
import {EMPTY, Observable, of} from 'rxjs';
import {SourceFile} from 'ts-morph';

import {isPagePoint} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {NgDocBuildableStore} from '../buildable-store';
import {PAGE_NAME} from '../variables';
import {NgDocBuildable} from './buildable';
import {NgDocPagePoint} from './page';

export class NgDocPageDependenciesPoint extends NgDocBuildable<NgDocPagePoint> {

	constructor(
		protected override readonly context: NgDocBuilderContext,
		protected override readonly buildables: NgDocBuildableStore,
		protected override readonly sourceFile: SourceFile,
	) {
		super(context, buildables, sourceFile);
	}

	get isRoot(): boolean {
		// always false, page dependencies are not rooted
		return false;
	}

	get folderPathInGenerated(): string {
		return this.parent?.folderPathInGenerated || '';
	}

	get dependencies(): string[] {
		return [];
	}

	get buildCandidates(): NgDocBuildable[] {
		return [];
	}

	get parent(): NgDocPagePoint | undefined {
		const expectedPath: string = path.join(this.sourceFileFolder, PAGE_NAME);
		const buildable: NgDocBuildable | undefined = this.buildables.get(expectedPath);

		return buildable && isPagePoint(buildable) ? buildable : undefined;
	}

	emit(): Observable<void> {
		/*
			We don't want to emit current source file, because it may be depended on project's files,
			so it may take too much time, the fastest way is to parse source file.
		 */
		return of(void 0);
	}

	update(): void {
		console.log('asd')
	}

	build(): Observable<NgDocBuildedOutput[]> {
		return of([]);
	}

}
