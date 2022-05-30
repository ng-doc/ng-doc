import * as minimatch from 'minimatch';
import * as path from 'path';
import {from, merge, Observable} from 'rxjs';
import {concatMap, debounceTime, mergeAll, tap} from 'rxjs/operators';
import {Constructor, ModuleKind, Project, SourceFile} from 'ts-morph';

import {asArray, isCategoryPoint, isPagePoint, isPresent} from '../helpers';
import {NgDocBuilderContext} from '../interfaces';
import {NgDocContextEnv, NgDocRoutingEnv} from '../templates-env';
import {NgDocBuildable} from './buildable';
import {NgDocCategoryPoint} from './category';
import {NgDocPagePoint} from './page';
import {NgDocRenderer} from './renderer';
import {CACHE_PATH, CATEGORY_PATTERN, GENERATED_PATH, PAGE_PATTERN} from './variables';
import {NgDocWatcher} from './watcher';

export class NgDocBuilder {
	private readonly project: Project;
	private readonly watcher: NgDocWatcher;
	private readonly buildables: Map<string, NgDocBuildable> = new Map();

	constructor(private readonly context: NgDocBuilderContext) {
		this.watcher = new NgDocWatcher(
			asArray(this.context.options.ngDoc.pages)
				.map((pagesPath: string) => [
					path.join(pagesPath, PAGE_PATTERN),
					path.join(pagesPath, CATEGORY_PATTERN),
				])
				.flat(),
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
		return merge([
			this.watcher.onAdd().pipe(tap((file: string) => this.addBuildable(file))),
			this.watcher.onUpdate().pipe(tap((file: string) => this.updateBuildable(file))),
			this.watcher.onDelete().pipe(tap((file: string) => this.removeBuildable(file))),
		]).pipe(
			mergeAll(),
			concatMap((files: string | string[]) => from(this.build(...asArray(files)))),
			debounceTime(10),
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
		for (const buildable of paths) {
			if (this.buildables.get(buildable)) {
				this.project.getSourceFile(buildable)?.refreshFromFileSystemSync();
			}
		}
	}

	removeBuildable(...paths: string[]): void {
		paths.forEach((buildablePaths: string) => {
			this.buildables.get(buildablePaths)?.destroy();
			this.buildables.delete(buildablePaths);
		});
	}

	async build(...changedBuildables: string[]): Promise<void> {
		this.context.context.reportStatus('Building documentation...');
		await this.project.emit();

		const buildables: NgDocBuildable[] = changedBuildables
			.map((buildablePath: string) => this.buildables.get(buildablePath))
			.filter(isPresent);

		// first we're updating the entry points to build dependencies
		for (const buildable of buildables) {
			buildable.update();
		}

		// when all dependencies are updated, we're rendering entry points data for changed entry points and for parent dependencies
		const buildCandidates: NgDocBuildable[] = this.getBuildCandidates(buildables);

		for (const buildable of buildCandidates) {
			await buildable.build();
		}

		await Promise.all([await this.renderRoutes(), await this.renderContext()]);
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
		return asArray(this.buildables.values()).filter((buildable: NgDocBuildable) => buildable.isRoot);
	}

	private async renderRoutes(): Promise<void> {
		const buildables: NgDocBuildable[] = this.getRootBuildables();
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocRoutingEnv>({buildables});

		await renderer.renderToFolder('ng-doc.routing.ts.nunj', GENERATED_PATH);
	}

	private async renderContext(): Promise<void> {
		const buildables: NgDocBuildable[] = this.getRootBuildables();
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocContextEnv>({buildables});

		await renderer.renderToFolder('ng-doc.context.ts.nunj', GENERATED_PATH);
	}
}
