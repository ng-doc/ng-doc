import * as path from 'path';
import {forkJoin, Observable} from 'rxjs';
import {concatMap, map, mapTo, tap} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {asArray, createProject, emitBuildedOutput} from '../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../interfaces';
import {NgDocContextEnv, NgDocRoutingEnv} from '../templates-env';
import {NgDocEntity} from './entities/entity';
import {NgDocEntityStore} from './entity-store';
import {NgDocRenderer} from './renderer';
import {CACHE_PATH, GENERATED_PATH} from './variables';

export class NgDocBuilder {
	private readonly project: Project;
	private readonly entities: NgDocEntityStore;

	constructor(private readonly context: NgDocBuilderContext) {
		this.project = createProject({
			tsConfigFilePath: this.context.options.ngDoc.tsConfig,
			compilerOptions: {
				rootDir: this.context.context.workspaceRoot,
				outDir: CACHE_PATH,
			},
		});

		this.entities = new NgDocEntityStore(this.context, this.project);
	}

	run(): Observable<void> {
		console.time('Build documentation');
		return this.entities.changes.pipe(
			concatMap((entities: NgDocEntity | NgDocEntity[]) => this.build(...asArray(entities))),
			tap(() => console.timeEnd('Build documentation')),
		);
	}

	build(...changedEntities: NgDocEntity[]): Observable<void> {
		this.context.context.reportStatus('Building documentation...');

		return forkJoin([
			...changedEntities.map((entity: NgDocEntity) => entity.build()),
			this.buildRoutes(),
			this.buildContext(),
		]).pipe(
			map((output: Array<NgDocBuildedOutput | NgDocBuildedOutput[]>) => output.flat()),
			tap((output: NgDocBuildedOutput[]) => emitBuildedOutput(...output)),
			mapTo(void 0),
		);
	}

	private buildRoutes(): Observable<NgDocBuildedOutput> {
		const entities: NgDocEntity[] = this.entities.rootEntitiesForBuild;
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocRoutingEnv>({entities});

		return renderer
			.render('ng-doc.routing.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: path.join(GENERATED_PATH, 'ng-doc.routing.ts')})));
	}

	private buildContext(): Observable<NgDocBuildedOutput> {
		const entities: NgDocEntity[] = this.entities.rootEntitiesForBuild;
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocContextEnv>({entities});

		return renderer
			.render('ng-doc.context.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: path.join(GENERATED_PATH, 'ng-doc.context.ts')})));
	}
}
