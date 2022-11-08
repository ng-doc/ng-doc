import {asArray} from '@ng-doc/core';
import path from 'path';
import {merge, Observable, of, Subject} from 'rxjs';
import {map, withLatestFrom} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {NgDocBuilderContext, NgDocBuiltOutput} from '../../interfaces';
import {bufferDebounce} from '../../operators';
import {Constructable} from '../../types';
import {
	NgDocApiEntity,
	NgDocCategoryEntity,
	NgDocDependenciesEntity,
	NgDocPageEntity,
	NgDocPlaygroundEntity,
} from '../entities';
import {NgDocEntity} from '../entities/abstractions/entity';
import {API_PATTERN, CATEGORY_PATTERN, PAGE_DEPENDENCY_PATTERN, PAGE_PATTERN, PLAYGROUND_PATTERN} from '../variables';
import {NgDocWatcher} from '../watcher';
import {buildEntity} from './operators/build-entity';
import {compileSourceFile} from './operators/compile-source-file';
import {forEach} from './operators/for-each';
import {updateEntity} from './operators/update-entity';
import {updateSourceFile} from './operators/update-source-file';
import {watchForChanges} from './operators/watch-for-changes';

export class EntityQueue implements Iterable<NgDocEntity> {
	private readonly entities: Map<string, NgDocEntity> = new Map<string, NgDocEntity>();
	private readonly watcher: NgDocWatcher;
	private readonly queue: Observable<NgDocEntity[]>;
	private readonly addOrUpdateEntity: Subject<NgDocEntity> = new Subject<NgDocEntity>();

	constructor(private readonly project: Project, private readonly context: NgDocBuilderContext) {
		this.watcher = new NgDocWatcher().watch(
			asArray(this.context.options.ngDoc.pages)
				.map((pagesPath: string) => [
					path.join(pagesPath, PAGE_PATTERN),
					path.join(pagesPath, CATEGORY_PATTERN),
					path.join(pagesPath, PAGE_DEPENDENCY_PATTERN),
					path.join(pagesPath, API_PATTERN),
					path.join(pagesPath, PLAYGROUND_PATTERN),
				])
				.flat(),
		);

		// New entities that come from FileSystem
		const newEntities: Observable<NgDocEntity> = merge(
			this.watcher.onAdd(PAGE_PATTERN).pipe(withLatestFrom(of(NgDocPageEntity))),
			this.watcher.onAdd(CATEGORY_PATTERN).pipe(withLatestFrom(of(NgDocCategoryEntity))),
			this.watcher.onAdd(PAGE_DEPENDENCY_PATTERN).pipe(withLatestFrom(of(NgDocDependenciesEntity))),
			this.watcher.onAdd(API_PATTERN).pipe(withLatestFrom(of(NgDocApiEntity))),
			this.watcher.onAdd(PLAYGROUND_PATTERN).pipe(withLatestFrom(of(NgDocPlaygroundEntity))),
		).pipe(
			map(
				([path, Entity]: [string, Constructable<NgDocEntity>]) =>
					new Entity(this.project, this.project.addSourceFileAtPath(path), this.context, this.entities),
			),
		);

		this.queue = merge(newEntities, this.addOrUpdateEntity)
			.pipe(
				updateSourceFile(),
				compileSourceFile(),
				bufferDebounce(20),
				forEach((entity: NgDocEntity) =>
					of(entity)
						.pipe(
							updateEntity(),
							watchForChanges(),
						)
				)
			);

		this.queue.pipe(
			forEach((entity: NgDocEntity) => of(entity).pipe(buildEntity())),
			map((output: NgDocBuiltOutput[][]) => output.flat()),
		)
	}

	*[Symbol.iterator](): Iterator<NgDocEntity> {
		for (const value of asArray(this.entities.values())) {
			yield value;
		}
	}

	private add(entity: NgDocEntity): void {
		if (this.entities.get(entity.id)) {
			throw new Error(`Entity with id "${entity.id}" already exists.`);
		}
		this.entities.set(entity.id, entity);
	}

	private remove(entity: NgDocEntity): void {
		this.entities.delete(entity.id);
	}
}
