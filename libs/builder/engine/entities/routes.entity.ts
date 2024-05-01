import * as path from 'path';
import { Observable, of } from 'rxjs';

import { NgDocBuildResult } from '../../interfaces';
import { renderTemplate } from '../nunjucks';
import { NgDocEntity } from './abstractions/entity';

export class NgDocRoutesEntity extends NgDocEntity {
	override id: string = `NgDocRoutes`;
	override isRoot: boolean = false;
	readonly parent: undefined = undefined;
	override rootFiles: string[] = [];
	override buildCandidates: NgDocEntity[] = [];

	build(): Observable<NgDocBuildResult<string>> {
		const entities: NgDocEntity[] = this.store.getRootEntitiesForBuild();
		const outFolder: string = this.context.buildPath;
		const result: string = renderTemplate('./routing.ts.nunj', {
			context: { entities, outFolder },
		});

		return of({
			result,
			entity: this,
			toBuilderOutput: async (content: string) => ({
				content,
				filePath: path.join(outFolder, 'ng-doc.routing.ts'),
			}),
		});
	}
}
