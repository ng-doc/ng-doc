import {NgDocPageSectionIndex} from '@ng-doc/core';
import path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';

import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocEntity} from './abstractions/entity';

export class NgDocSkeletonEntity extends NgDocEntity {
	readonly id: string = 'NgDocSkeletonEntity';
	readonly isRoot: boolean = true;
	readonly rootFiles: string[] = [];
	readonly parent: undefined = undefined;
	readonly buildCandidates: NgDocEntity[] = [];

	override update(): Observable<void> {
		return of(void 0);
	}

	protected build(): Observable<NgDocBuiltOutput[]> {
		return forkJoin([
			this.buildIndexFile(),
			this.buildGeneratedModule(),
			this.buildRoutes(),
			this.buildContext(),
			this.buildIndexes(),
		]).pipe(
			map(
				([index, generatedModule, routes, context, indexes]: [
					NgDocBuiltOutput,
					NgDocBuiltOutput,
					NgDocBuiltOutput,
					NgDocBuiltOutput,
					NgDocBuiltOutput[],
				]) => [index, generatedModule, routes, context, ...indexes],
			),
		);
	}

	private buildRoutes(): Observable<NgDocBuiltOutput> {
		const entities: NgDocEntity[] = this.rootEntitiesForBuild;

		return this.builder.renderer.render('./routing.ts.nunj', {context: {entities}}).pipe(
			map((output: string) => ({
				content: output,
				filePath: path.join(this.context.buildPath, 'ng-doc.routing.ts'),
			})),
		);
	}

	private buildContext(): Observable<NgDocBuiltOutput> {
		const entities: NgDocEntity[] = this.rootEntitiesForBuild;

		return this.builder.renderer.render('./context.ts.nunj', {context: {entities}}).pipe(
			map((output: string) => ({
				content: output,
				filePath: path.join(this.context.buildPath, 'ng-doc.context.ts'),
			})),
		);
	}

	private buildIndexFile(): Observable<NgDocBuiltOutput> {
		return this.builder.renderer.render('./index.ts.nunj').pipe(
			map((output: string) => ({
				content: output,
				filePath: path.join(this.context.buildPath, 'index.ts'),
			})),
		);
	}

	private buildGeneratedModule(): Observable<NgDocBuiltOutput> {
		return this.builder.renderer.render('./ng-doc.generated.module.ts.nunj').pipe(
			map((output: string) => ({
				content: output,
				filePath: path.join(this.context.buildPath, 'ng-doc.generated.module.ts'),
			})),
		);
	}

	private buildIndexes(): Observable<NgDocBuiltOutput[]> {
		const allIndexes: NgDocPageSectionIndex[] = this.builder.entities
			.asArray()
			.map((entity: NgDocEntity) => entity.indexes)
			.flat();

		return of(allIndexes).pipe(
			map((sectionIndexes: NgDocPageSectionIndex[]) => [
				{
					content: JSON.stringify(sectionIndexes, null, 2),
					filePath: path.join(this.context.assetsPath, 'indexes.json'),
				},
			]),
		);
	}

	private get rootEntitiesForBuild(): NgDocEntity[] {
		return this.builder.entities.asArray().filter((entity: NgDocEntity) => entity.isRoot && this.isReady(entity));
	}

	private isReady(entity: NgDocEntity): boolean {
		return entity.isReadyForBuild;
	}
}
