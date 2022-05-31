import * as minimatch from 'minimatch';
import * as path from 'path';
import {forkJoin, from, merge, Observable} from 'rxjs';
import {bufferTime, concatMap, filter, first, map, mapTo, switchMap, take, tap} from 'rxjs/operators';
import {Constructor, ModuleKind, Project, SourceFile} from 'ts-morph';

import {asArray, isCategoryPoint, isPagePoint} from '../helpers';
import {NgDocBuilderContext} from '../interfaces';
import {NgDocContextEnv, NgDocRoutingEnv} from '../templates-env';
import {NgDocBuildable} from './buildable';
import {BuildableStore} from './buildable-store';
import {NgDocCategoryPoint} from './category';
import {NgDocPagePoint} from './page';
import {NgDocRenderer} from './renderer';
import {CACHE_PATH, CATEGORY_PATTERN, GENERATED_PATH, PAGE_PATTERN} from './variables';
import {NgDocWatcher} from './watcher';

export class NgDocBuilder {
	private readonly project: Project;
	private readonly watcher: NgDocWatcher;
	private readonly buildables: BuildableStore = new BuildableStore();

	constructor(private readonly context: NgDocBuilderContext) {
		this.watcher = new NgDocWatcher(
			asArray(this.context.options.ngDoc.pages)
				.map((pagesPath: string) => [
					path.join(pagesPath, PAGE_PATTERN),
					path.join(pagesPath, CATEGORY_PATTERN),
				])
				.flat(),
			(path: string) => this.addBuildable(path),
			(path: string) => this.updateBuildable(path),
			(path: string) => this.removeBuildable(path),
		);

		this.project = new Project({
			tsConfigFilePath: this.context.options.ngDoc.tsConfig,
			compilerOptions: {
				module: ModuleKind.CommonJS,
				rootDir: this.context.context.workspaceRoot,
				outDir: CACHE_PATH,
				sourceMap: false,
				incremental: true,
				declaration: false,
				skipLibCheck: true,
			},
			skipAddingFilesFromTsConfig: true,
		});
	}

	run(): Observable<void> {
		return merge(
			this.buildables.changes,
			this.buildables.changes.pipe(
				switchMap(() =>
					merge(...asArray(this.buildables).map((buildable: NgDocBuildable) => buildable.needToRebuild)),
				),
			),
		).pipe(
			bufferTime(500),
			filter((buildables: NgDocBuildable[]) => buildables.length > 0),
			concatMap((buildables: NgDocBuildable[]) => this.build(...buildables)),
		);
	}

	addBuildable(...paths: string[]): void {
		for (const buildablePath of paths) {
			if (!this.buildables.get(buildablePath)) {
				const sourceFile: SourceFile = this.project.addSourceFileAtPath(buildablePath);
				const Constructor: Constructor<NgDocBuildable> = this.getBuildableConstructor(buildablePath);

				this.buildables.set(buildablePath, new Constructor(this.context, this.buildables, sourceFile));
			}
		}
	}

	updateBuildable(...paths: string[]): void {
		for (const buildablePath of paths) {
			if (this.buildables.get(buildablePath)) {
				this.project.getSourceFile(buildablePath)?.refreshFromFileSystemSync();
				this.buildables.touch(buildablePath);
			}
		}
	}

	removeBuildable(...paths: string[]): void {
		paths.forEach((buildablePaths: string) => {
			this.buildables.get(buildablePaths)?.destroy();
			this.buildables.delete(buildablePaths);
		});
	}

	build(...changedBuildables: NgDocBuildable[]): Observable<void> {
		this.context.context.reportStatus('Building documentation...');

		return from(this.project.emit()).pipe(
			// first we're updating the buildables to update compiled files
			tap(() => changedBuildables.forEach((buildable: NgDocBuildable) => buildable.update())),
			// get build candidates based on changed buildables dependencies
			map(() => this.getBuildCandidates(changedBuildables)),
			// build all candidates
			switchMap((buildCandidates: NgDocBuildable[]) =>
				forkJoin([
					...buildCandidates.map((buildable: NgDocBuildable) => buildable.build()),
					this.renderRoutes(),
					this.renderContext(),
				]),
			),
			mapTo(void 0),
			take(1),
		);
	}

	private getBuildCandidates(buildables: NgDocBuildable | NgDocBuildable[]): NgDocBuildable[] {
		return asArray(
			new Set(
				...asArray(buildables).map((buildable: NgDocBuildable) => [
					buildable,
					...(isPagePoint(buildable)
						? buildable.parentDependencies
						: isCategoryPoint(buildable)
						? buildable.childDependencies
						: []),
				]),
			),
		);
	}

	private getBuildableConstructor(path: string): Constructor<NgDocBuildable> {
		if (minimatch(path, PAGE_PATTERN)) {
			return NgDocPagePoint;
		} else if (minimatch(path, CATEGORY_PATTERN)) {
			return NgDocCategoryPoint;
		} else {
			throw new Error(`Unknown buildable type for path: ${path}`);
		}
	}

	private getRootBuildables(): NgDocBuildable[] {
		return asArray(this.buildables).filter((buildable: NgDocBuildable) => buildable.isRoot);
	}

	private renderRoutes(): Observable<void> {
		const buildables: NgDocBuildable[] = this.getRootBuildables();
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocRoutingEnv>({buildables});

		return renderer.renderToFolder('ng-doc.routing.ts.nunj', GENERATED_PATH);
	}

	private renderContext(): Observable<void> {
		const buildables: NgDocBuildable[] = this.getRootBuildables();
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocContextEnv>({buildables});

		return renderer.renderToFolder('ng-doc.context.ts.nunj', GENERATED_PATH);
	}
}
