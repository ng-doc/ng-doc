import * as path from 'path';
import {ModuleKind, Project, SourceFile} from 'ts-morph';
import {asArray, isPresent, NgDocBuilderContext} from '@ng-doc/core';
import {from, merge, Observable} from 'rxjs';
import {mergeAll, switchMap, tap} from 'rxjs/operators';
import {NgDocEntryPoint} from './entry-point';
import {CACHE_PATH, ENTRY_POINT_PATTERN, GENERATED_PATH} from './variables';
import {NgDocRenderer} from './renderer';
import {NgDocWatcher} from './watcher';
import {NgDocContextEnv, NgDocRoutingEnv} from './templates-env';

export class NgDocBuilder {
	private readonly project: Project;
	private readonly watcher: NgDocWatcher;
	private readonly entryPoints: Map<string, NgDocEntryPoint> = new Map();

	constructor(private readonly context: NgDocBuilderContext) {
		this.watcher = new NgDocWatcher(
			asArray(this.context.options.ngDoc.pages).map((pagesPath: string) =>
				path.join(pagesPath, ENTRY_POINT_PATTERN),
			),
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

	public run(): Observable<void> {
		return merge([
			this.watcher.onAdd().pipe(tap((file: string) => this.addEntryPoint(file))),
			this.watcher.onUpdate().pipe(tap((file: string) => this.updateEntryPoint(file))),
			this.watcher.onDelete().pipe(tap((file: string) => this.removeEntryPoint(file))),
		]).pipe(
			mergeAll(),
			switchMap((files: string | string[]) => from(this.build(...asArray(files)))),
		);
	}

	addEntryPoint(...paths: string[]): void {
		for (const entryPointPath of paths) {
			if (!this.entryPoints.get(entryPointPath)) {
				const sourceFile: SourceFile = this.project.addSourceFileAtPath(entryPointPath);

				this.entryPoints.set(entryPointPath, new NgDocEntryPoint(this.context, this.entryPoints, sourceFile));
			}
		}
	}

	updateEntryPoint(...paths: string[]): void {
		for (const entryPointPath of paths) {
			if (this.entryPoints.get(entryPointPath)) {
				this.project.getSourceFile(entryPointPath)?.refreshFromFileSystemSync();
			}
		}
	}

	removeEntryPoint(...paths: string[]): void {
		paths.forEach((entryPointPath: string) => {
			this.entryPoints.get(entryPointPath)?.destroy();
			this.entryPoints.delete(entryPointPath);
		});
	}

	async build(...changedEntryPoints: string[]): Promise<void> {
		await this.project.emit();

		const entryPoints: NgDocEntryPoint[] = changedEntryPoints
			.map((entryPointPath: string) => this.entryPoints.get(entryPointPath))
			.filter(isPresent);

		for (const entryPoint of entryPoints) {
			entryPoint.update();

			await Promise.all([entryPoint.renderModule(), entryPoint.renderPage()]);
		}

		await Promise.all([await this.renderRoutes(), await this.renderContext()]);
	}

	private async renderRoutes(): Promise<void> {
		const entryPoints: NgDocEntryPoint[] = Array.from(this.entryPoints.values()).filter(
			(entryPoint: NgDocEntryPoint) => entryPoint.isRootRoute,
		);
		const renderer: NgDocRenderer = new NgDocRenderer<NgDocRoutingEnv>({entryPoints});

		await renderer.renderToFolder('ng-doc.routing.ts.ejs', GENERATED_PATH);
	}

	private async renderContext(): Promise<void> {
		const entryPoints: NgDocEntryPoint[] = Array.from(this.entryPoints.values()).filter(
			(entryPoint: NgDocEntryPoint) => entryPoint.isRootRoute,
		);
		const renderer: NgDocRenderer = new NgDocRenderer<NgDocContextEnv>({entryPoints});

		await renderer.renderToFolder('ng-doc.context.ts.ejs', GENERATED_PATH);
	}
}
