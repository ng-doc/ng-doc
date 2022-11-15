import {asArray} from '@ng-doc/core';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {isPageEntity, uniqueName} from '../../helpers';
import {NgDocApiScope, NgDocBuilderContext, NgDocBuiltOutput} from '../../interfaces';
import {NgDocApiScopeModuleEnv} from '../../templates-env/api-scope.module.env';
import {NgDocBuilder} from '../builder';
import {NgDocRenderer} from '../renderer';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
import {NgDocApiEntity} from './api.entity';
import {NgDocPageEntity} from './page.entity';

export class NgDocApiScopeEntity extends NgDocNavigationEntity<NgDocApiScope> {
	override moduleName: string = uniqueName(`NgDocGeneratedApiScopeCategoryModule`);
	override readonly isNavigable: boolean = false;
	protected override readyToBuild: boolean = true;
	override moduleFileName: string = `${uniqueName('ng-doc-api-scope')}.module.ts`;
	override id: string = uniqueName(`${this.sourceFilePath}}#${this.target.route}`);

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

	/**
	 * Returns full url from the root
	 *
	 * @type {string}
	 */
	get url(): string {
		return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
	}

	override get order(): number | undefined {
		return this.target?.order;
	}

	get pages(): NgDocPageEntity[] {
		return asArray(this.children.values()).filter(isPageEntity);
	}

	override get title(): string {
		return this.target.name;
	}

	override get buildCandidates(): NgDocEntity[] {
		return this.childEntities;
	}

	override emit() {
		// Emitting source file is not necessary for this type of entity
	}

	override update(): Observable<void> {
		return of(void 0);
	}

	protected override build(): Observable<NgDocBuiltOutput[]> {
		return this.isReadyToBuild ? forkJoin([this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuiltOutput> {
		if (this.target) {
			const renderer: NgDocRenderer<NgDocApiScopeModuleEnv> = new NgDocRenderer<NgDocApiScopeModuleEnv>({
				scope: this,
			});

			return renderer
				.render('api-scope.module.ts.nunj')
				.pipe(map((output: string) => ({output, filePath: this.modulePath})));
		}
		return of();
	}

	override destroy(): void {
		this.children.forEach((child: NgDocEntity) => child.destroy());

		super.destroy();
	}
}
