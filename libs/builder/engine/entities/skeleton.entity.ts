import path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';

import {buildGlobalIndexes} from '../../helpers/build-global-indexes';
import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocContextEnv, NgDocRoutingEnv} from '../../templates-env';
import {NgDocRenderer} from '../renderer';
import {GENERATED_ASSETS_PATH, GENERATED_PATH} from '../variables';
import {NgDocEntity} from './abstractions/entity';

export class NgDocSkeletonEntity extends NgDocEntity {
	readonly id: string = 'NgDocSkeletonEntity';
	readonly isRoot: boolean = true;
	readonly rootFiles: string[] = [];
	readonly parent: undefined = undefined;
	readonly buildCandidates: NgDocEntity[] = [];

	override init(): Observable<void> {
		return of(void 0);
	}

	override update(): Observable<void> {
		return of(void 0);
	}

	protected build(): Observable<NgDocBuiltOutput[]> {
		return forkJoin([this.buildRoutes(), this.buildContext(), this.buildIndexes()]).pipe(
			map(([routes, context, indexes]: [NgDocBuiltOutput, NgDocBuiltOutput, NgDocBuiltOutput[]]) => [
				routes,
				context,
				...indexes,
			]),
		);
	}

	private buildRoutes(): Observable<NgDocBuiltOutput> {
		const entities: NgDocEntity[] = this.rootEntitiesForBuild;
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocRoutingEnv>(this.builder, {entities});

		return renderer
			.render('./routing.ts.nunj')
			.pipe(
				map((output: string) => ({content: output, filePath: path.join(GENERATED_PATH, 'ng-doc.routing.ts')})),
			);
	}

	private buildContext(): Observable<NgDocBuiltOutput> {
		const entities: NgDocEntity[] = this.rootEntitiesForBuild;
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocContextEnv>(this.builder, {entities});

		return renderer
			.render('./context.ts.nunj')
			.pipe(
				map((output: string) => ({content: output, filePath: path.join(GENERATED_PATH, 'ng-doc.context.ts')})),
			);
	}

	private buildIndexes(): Observable<NgDocBuiltOutput[]> {
		const [dictionary, indexes] = buildGlobalIndexes(this.builder.entities.asArray().filter(this.isReady));

		return of([
			{
				content: dictionary,
				filePath: path.join(GENERATED_ASSETS_PATH, 'pages.json'),
			},
			{
				content: indexes,
				filePath: path.join(GENERATED_ASSETS_PATH, 'indexes.json'),
			},
		]);
	}

	private get rootEntitiesForBuild(): NgDocEntity[] {
		return this.builder.entities.asArray().filter((entity: NgDocEntity) => entity.isRoot && this.isReady(entity));
	}

	private isReady(entity: NgDocEntity): boolean {
		return entity.isReadyForBuild;
	}
}
