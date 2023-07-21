import path from 'path';
import {Observable, of} from 'rxjs';

import {NgDocBuildResult} from '../../interfaces';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';
import {NgDocGeneratedModuleEntity} from './generated-module.entity';
import {NgDocIndexFileEntity} from './index-file.entity';
import {NgDocRoutesEntity} from './routes.entity';

export class NgDocSkeletonEntity extends NgDocEntity {
	readonly id: string = 'NgDocSkeletonEntity';
	readonly isRoot: boolean = true;
	readonly rootFiles: string[] = [];
	readonly parent: undefined = undefined;
	readonly buildCandidates: NgDocEntity[] = [];

	override childrenGenerator(): Observable<NgDocEntity[]> {
		return of([
			new NgDocRoutesEntity(this.store, this.cache, this.context, this),
			new NgDocIndexFileEntity(this.store, this.cache, this.context, this),
			new NgDocGeneratedModuleEntity(this.store, this.cache, this.context, this),
		]);
	}

	build(): Observable<NgDocBuildResult<string>> {
		const entities: NgDocEntity[] = this.rootEntitiesForBuild;
		const result: string = renderTemplate('./context.ts.nunj', {context: {entities}});

		return of({
			result,
			entity: this,
			toBuilderOutput: async (content: string) => ({
				content,
				filePath: path.join(this.context.buildPath, 'ng-doc.context.ts'),
			}),
		});
	}

	get rootEntitiesForBuild(): NgDocEntity[] {
		return this.store.asArray().filter((e: NgDocEntity) => e.isRoot && e.isReadyForBuild);
	}
}
