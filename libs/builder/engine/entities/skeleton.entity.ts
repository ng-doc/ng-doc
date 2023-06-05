import path from 'path';
import {forkJoin, Observable, of} from 'rxjs';

import {NgDocBuildOutput} from '../../interfaces';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';

export class NgDocSkeletonEntity extends NgDocEntity {
	readonly id: string = 'NgDocSkeletonEntity';
	readonly isRoot: boolean = true;
	readonly rootFiles: string[] = [];
	readonly parent: undefined = undefined;
	readonly buildCandidates: NgDocEntity[] = [];

	protected buildImpl(): Observable<NgDocBuildOutput[]> {
		return forkJoin([this.buildIndexFile(), this.buildGeneratedModule(), this.buildRoutes(), this.buildContext()]);
	}

	private buildRoutes(): Observable<NgDocBuildOutput> {
		const entities: NgDocEntity[] = this.rootEntitiesForBuild;

		const content: string = renderTemplate('./routing.ts.nunj', {context: {entities}});

		return of({content, filePath: path.join(this.context.buildPath, 'ng-doc.routing.ts')});
	}

	private buildContext(): Observable<NgDocBuildOutput> {
		const entities: NgDocEntity[] = this.rootEntitiesForBuild;

		const content: string = renderTemplate('./context.ts.nunj', {context: {entities}});

		return of({content, filePath: path.join(this.context.buildPath, 'ng-doc.context.ts')});
	}

	private buildIndexFile(): Observable<NgDocBuildOutput> {
		const content: string = renderTemplate('./index.ts.nunj');

		return of({content, filePath: path.join(this.context.buildPath, 'index.ts')});
	}

	private buildGeneratedModule(): Observable<NgDocBuildOutput> {
		const content: string = renderTemplate('./ng-doc.generated.module.ts.nunj');

		return of({content, filePath: path.join(this.context.buildPath, 'ng-doc.generated.module.ts')});
	}

	private get rootEntitiesForBuild(): NgDocEntity[] {
		return this.store.asArray().filter((e: NgDocEntity) => e.isRoot && e.isReadyForBuild);
	}
}
