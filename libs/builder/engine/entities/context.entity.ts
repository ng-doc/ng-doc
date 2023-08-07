import path from 'path';
import {Observable, of} from 'rxjs';

import {NgDocBuildResult} from '../../interfaces';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';

export class NgDocContextEntity extends NgDocEntity {
	readonly id: string = 'NgDocContextEntity';
	readonly isRoot: boolean = true;
	readonly rootFiles: string[] = [];
	readonly parent: undefined = undefined;
	readonly buildCandidates: NgDocEntity[] = [];

	build(): Observable<NgDocBuildResult<string>> {
		const entities: NgDocEntity[] = this.store.getRootEntitiesForBuild();
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
}
