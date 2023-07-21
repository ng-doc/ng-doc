import * as path from 'path';
import {Observable, of} from 'rxjs';

import {NgDocBuilderContext, NgDocBuildResult} from '../../interfaces';
import {NgDocEntityStore} from '../entity-store';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';
import {CachedEntity, CachedFilesGetter, NgDocCache} from './cache';
import {NgDocSkeletonEntity} from './skeleton.entity';

@CachedEntity()
export class NgDocGeneratedModuleEntity extends NgDocEntity {
	override id: string = `${this.parent.id}#generatedModule`;
	override isRoot: boolean = false;

	constructor(
		override readonly store: NgDocEntityStore,
		override readonly cache: NgDocCache,
		override readonly context: NgDocBuilderContext,
		readonly parent: NgDocSkeletonEntity,
	) {
		super(store, cache, context);
	}

	override get rootFiles(): string[] {
		return [];
	}

	override get buildCandidates(): NgDocEntity[] {
		return [this.parent];
	}

	@CachedFilesGetter()
	get outputPath(): string {
		return path.join(this.context.buildPath, 'ng-doc.generated.module.ts');
	}

	build(): Observable<NgDocBuildResult<string>> {
		return of({
			result: renderTemplate('./ng-doc.generated.module.ts.nunj'),
			entity: this,
			toBuilderOutput: async (content: string) => ({
				content,
				filePath: this.outputPath,
			}),
		});
	}
}
