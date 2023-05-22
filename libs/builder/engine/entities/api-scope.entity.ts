import {asArray, NgDocApiScope} from '@ng-doc/core';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {isPageEntity, uniqueName} from '../../helpers';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../../interfaces';
import {NgDocBuilder} from '../builder';
import {NgDocEntity} from './abstractions/entity';
import {NgDocRouteEntity} from './abstractions/route.entity';
import {NgDocApiEntity} from './api.entity';
import {CachedEntity} from './cache/decorators';
import {NgDocPageEntity} from './page.entity';

@CachedEntity()
export class NgDocApiScopeEntity extends NgDocRouteEntity<NgDocApiScope> {
	override readonly physical: boolean = false;
	protected override readyToBuild: boolean = true;
	override id: string = uniqueName(`${this.sourceFilePath}#${this.target.route}`);

	constructor(
		override readonly builder: NgDocBuilder,
		override readonly sourceFile: SourceFile,
		override readonly context: NgDocBuilderContext,
		override parent: NgDocApiEntity,
		override target: NgDocApiScope,
	) {
		super(builder, sourceFile, context);
	}

	override get rootFiles(): string[] {
		return [];
	}

	override get isRoot(): boolean {
		// always false, api scopes are not rooted
		return false;
	}

	override get route(): string {
		return this.target.route;
	}

	override get keywords(): string[] {
		return [];
	}

	override get folderName(): string {
		return this.route;
	}

	/**
	 * Returns full url from the root
	 *
	 * @type {string}
	 */
	get url(): string {
		return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
	}

	get pages(): NgDocPageEntity[] {
		return asArray(this.children.values()).filter(isPageEntity);
	}

	override get title(): string {
		return this.target.name;
	}

	get order(): number | undefined {
		return this.target.order;
	}

	override get buildCandidates(): NgDocEntity[] {
		return this.childEntities;
	}

	override emit(): Observable<void> {
		// Emitting source file is not necessary for this type of entity
		return of(void 0);
	}

	override update(): Observable<void> {
		return of(void 0);
	}

	protected override build(): Observable<NgDocBuiltOutput[]> {
		return this.isReadyForBuild ? forkJoin([this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuiltOutput> {
		if (this.target) {
			return this.builder.renderer
				.render('./api-scope.module.ts.nunj', {
					context: {
						scope: this,
					},
				})
				.pipe(map((output: string) => ({content: output, filePath: this.modulePath})));
		}
		return of();
	}

	override destroy(): void {
		this.children.forEach((child: NgDocEntity) => child.destroy());

		super.destroy();
	}
}
