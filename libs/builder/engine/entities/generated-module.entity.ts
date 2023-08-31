import * as path from 'path';
import {Observable, of} from 'rxjs';

import {NgDocBuildResult} from '../../interfaces';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';
import {CachedEntity, CachedFilesGetter} from './cache';

@CachedEntity()
export class NgDocGeneratedModuleEntity extends NgDocEntity {
	override id: string = `NgDocGeneratedModule`;
	override isRoot: boolean = false;
	readonly parent: undefined = undefined;
	override rootFiles: string[] = [];
	override buildCandidates: NgDocEntity[] = [];

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
