import * as path from 'path';
import {forkJoin, Observable} from 'rxjs';
import {concatMap, map, mapTo, tap} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {asArray, createProject, emitBuildedOutput} from '../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../interfaces';
import {NgDocContextEnv, NgDocRoutingEnv} from '../templates-env';
import {NgDocBuildableStore} from './buildable-store';
import {NgDocBuildable} from './buildables/buildable';
import {NgDocRenderer} from './renderer';
import {CACHE_PATH, GENERATED_PATH} from './variables';

export class NgDocBuilder {
	private readonly project: Project;
	private readonly buildables: NgDocBuildableStore;

	constructor(private readonly context: NgDocBuilderContext) {
		this.project = createProject({
			tsConfigFilePath: this.context.options.ngDoc.tsConfig,
			compilerOptions: {
				rootDir: this.context.context.workspaceRoot,
				outDir: CACHE_PATH,
			},
		});

		this.buildables = new NgDocBuildableStore(this.context, this.project);
	}

	run(): Observable<void> {
		console.time('Build documentation');
		return this.buildables.changes.pipe(
			concatMap((buildables: NgDocBuildable | NgDocBuildable[]) => this.build(...asArray(buildables))),
			tap(() => console.timeEnd('Build documentation')),
		);
	}

	build(...changedBuildables: NgDocBuildable[]): Observable<void> {
		this.context.context.reportStatus('Building documentation...');

		return forkJoin([
			...changedBuildables.map((buildable: NgDocBuildable) => buildable.build()),
			this.buildRoutes(),
			this.buildContext(),
		]).pipe(
			tap((output: Array<NgDocBuildedOutput | NgDocBuildedOutput[]>) => emitBuildedOutput(...output.flat())),
			mapTo(void 0),
		);
	}

	private buildRoutes(): Observable<NgDocBuildedOutput> {
		const buildables: NgDocBuildable[] = this.buildables.rootBuildablesForBuild;
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocRoutingEnv>({buildables});

		return renderer
			.render('ng-doc.routing.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: path.join(GENERATED_PATH, 'ng-doc.routing.ts')})));
	}

	private buildContext(): Observable<NgDocBuildedOutput> {
		const buildables: NgDocBuildable[] = this.buildables.rootBuildablesForBuild;
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocContextEnv>({buildables});

		return renderer
			.render('ng-doc.context.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: path.join(GENERATED_PATH, 'ng-doc.context.ts')})));
	}
}
