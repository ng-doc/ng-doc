import {ModuleKind, Project, SourceFile} from 'ts-morph';
import {NgDocEntryPoint} from './entry-point';
import {CACHE_PATH, GENERATED_PATH} from './variables';
import {NgDocRenderer} from './renderer';
import {asArray, isPresent, NgDocBuilderContext} from '@ng-doc/core';
import {NgDocWatcher} from './watcher';
import {from, merge, Observable} from 'rxjs';
import {mergeAll, switchMap, tap} from 'rxjs/operators';
import {NgDocRoutingEnv} from './templates-env';

export class NgDocBuilder {
  private readonly project: Project;
  private readonly watcher: NgDocWatcher;
  private readonly entryPoints: Map<string, NgDocEntryPoint> = new Map();

  constructor(private readonly context: NgDocBuilderContext) {
    this.watcher = new NgDocWatcher(context);

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
      this.watcher.onInitialized().pipe(tap((files: string[]) => this.addEntryPoint(...files))),
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
    paths.forEach((path: string) => {
      this.entryPoints.get(path)?.destroy();
      this.entryPoints.delete(path);
    });
  }

  async build(...changedEntryPoints: string[]): Promise<void> {
    await this.project.emit();

    const entryPoints: NgDocEntryPoint[] = changedEntryPoints
      .map((path: string) => this.entryPoints.get(path))
      .filter(isPresent);

    for (const entryPoint of entryPoints) {
      entryPoint.update();

      await Promise.all([
        entryPoint.renderModule(),
        entryPoint.renderPage(),
      ]);
    }

    await this.renderRoutes();
  }

  private async renderRoutes(): Promise<void> {
    const entryPoints: NgDocEntryPoint[] = Array.from(this.entryPoints.values()).filter(
      (entryPoint: NgDocEntryPoint) => entryPoint.isRootRoute,
    );
    const renderer: NgDocRenderer = new NgDocRenderer<NgDocRoutingEnv>({entryPoints});

    await renderer.renderToFolder('ng-doc.routing.ts.ejs', GENERATED_PATH);
  }
}
