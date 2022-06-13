import * as minimatch from 'minimatch';
import * as path from 'path';
import {forkJoin, merge, Observable, of} from 'rxjs';
import {finalize, map, startWith, switchMap, tap} from 'rxjs/operators';
import {Constructor, Project, SourceFile} from 'ts-morph';

import {asArray} from '../helpers';
import {NgDocBuilderContext} from '../interfaces';
import {bufferDebounce} from '../operators';
import {NgDocCategoryPoint} from './entities/category';
import {NgDocEntity} from './entities/entity';
import {NgDocPageEntity} from './entities/page';
import {NgDocPageDependenciesEntity} from './entities/page-dependencies';
import {CATEGORY_PATTERN, PAGE_DEPENDENCY_PATTERN, PAGE_PATTERN} from './variables';
import {NgDocWatcher} from './watcher';

export class NgDocEntityStore implements Iterable<NgDocEntity> {
	private readonly watcher: NgDocWatcher;
	private entities: Map<string, NgDocEntity> = new Map();

	constructor(private readonly context: NgDocBuilderContext, private readonly project: Project) {
		this.watcher = new NgDocWatcher(
			asArray(this.context.options.ngDoc.pages)
				.map((pagesPath: string) => [
					path.join(pagesPath, PAGE_PATTERN),
					path.join(pagesPath, CATEGORY_PATTERN),
					path.join(pagesPath, PAGE_DEPENDENCY_PATTERN),
				])
				.flat(),
		);
	}

	*[Symbol.iterator](): Iterator<NgDocEntity> {
		for (const value of asArray(this.entities.values())) {
			yield value;
		}
	}

	get changes(): Observable<NgDocEntity[]> {
		return merge(this.add(), this.update(), this.remove().pipe(map(asArray))).pipe(
			switchMap((entities: NgDocEntity[]) =>
				entities.length
					? forkJoin(...entities.map((entity: NgDocEntity) => entity.emit())).pipe(map(() => entities))
					: of(entities),
			),
			tap((entities: NgDocEntity[]) => entities.forEach((entity: NgDocEntity) => entity.update())),
			switchMap((entities: NgDocEntity[]) =>
				merge(...asArray(this).map((entity: NgDocEntity) => entity.needToRebuild)).pipe(
					bufferDebounce(50),
					startWith(this.getBuildCandidates(entities)),
				),
			),
			finalize(() => this.watcher.close()),
		);
	}

	get rootEntitiesForBuild(): NgDocEntity[] {
		return asArray(this.entities.values()).filter((entity: NgDocEntity) => entity.isRoot && entity.isReadyToBuild);
	}

	get(path: string): NgDocEntity | undefined {
		return this.entities.get(path);
	}

	has(path: string): boolean {
		return this.entities.has(path);
	}

	private add(): Observable<NgDocEntity[]> {
		return this.watcher.add.pipe(
			map((paths: string[]) => {
				const newEntities: NgDocEntity[] = [];

				for (const entityPath of paths) {
					if (!this.entities.get(entityPath)) {
						const sourceFile: SourceFile = this.project.addSourceFileAtPath(entityPath);
						const Constructor: Constructor<NgDocEntity> = this.getBuildableConstructor(entityPath);
						const newEntity: NgDocEntity = new Constructor(this.context, this.entities, sourceFile);

						newEntities.push(newEntity);
						this.entities.set(entityPath, newEntity);
					}
				}

				return newEntities;
			}),
		);
	}

	private update(): Observable<NgDocEntity[]> {
		return this.watcher.update.pipe(
			map((path: string) => {
				const entity: NgDocEntity | undefined = this.entities.get(path);

				if (!entity) {
					throw new Error(`Entity not found: ${path}`);
				}

				this.project.getSourceFile(path)?.refreshFromFileSystemSync();

				return [entity];
			}),
		);
	}

	private remove(): Observable<NgDocEntity | undefined> {
		return this.watcher.remove.pipe(
			map((path: string) => {
				const entity: NgDocEntity | undefined = this.entities.get(path);

				if (!entity) {
					throw new Error(`Entity not found: ${path}`);
				}

				const parent: NgDocEntity | undefined = entity.parent;

				entity?.destroy();
				this.entities.delete(path);

				// we return parent entity if we have it because we want to rebuild it when his child is removed
				return parent;
			}),
		);
	}

	private getBuildableConstructor(path: string): Constructor<NgDocEntity> {
		if (minimatch(path, PAGE_PATTERN)) {
			return NgDocPageEntity;
		} else if (minimatch(path, CATEGORY_PATTERN)) {
			return NgDocCategoryPoint;
		} else if (minimatch(path, PAGE_DEPENDENCY_PATTERN)) {
			return NgDocPageDependenciesEntity;
		} else {
			throw new Error(`Unknown entity type for path: ${path}`);
		}
	}

	private getBuildCandidates(entities: NgDocEntity | NgDocEntity[]): NgDocEntity[] {
		return asArray(
			new Set(
				asArray(entities)
					.map((buildable: NgDocEntity) => [buildable, ...buildable.buildCandidates])
					.flat(),
			),
		);
	}
}
