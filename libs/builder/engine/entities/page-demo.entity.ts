import path from 'path';
import { Observable, of } from 'rxjs';

import { getComponentAssets, getDemoClassDeclarations } from '../../helpers';
import { NgDocAsset, NgDocBuilderContext, NgDocBuildResult } from '../../interfaces';
import { NgDocComponentAsset } from '../../types';
import { NgDocEntityStore } from '../entity-store';
import { renderTemplate } from '../nunjucks';
import { NgDocEntity } from './abstractions/entity';
import { CachedEntity, CachedFilesGetter, NgDocCache } from './cache';
import { NgDocPageEntity } from './page.entity';
import {
	addToDependenciesPlugin,
	extractSnippetsPlugin,
	forArrayItems,
	forObjectValue,
	forObjectValues,
	postProcessHtmlPlugin,
	processHtmlPlugin,
	removeLinesPlugin,
} from './plugins';
import { applyPlugin } from './plugins/entity-plugins/apply.plugin';
import { wrapCodePlugin } from './plugins/entity-plugins/wrap-code.plugin';

@CachedEntity()
export class NgDocPageDemoEntity extends NgDocEntity {
	override readonly id: string = `${this.parent.id}#demo`;
	override readonly isRoot: boolean = false;

	constructor(
		override readonly store: NgDocEntityStore,
		override readonly cache: NgDocCache,
		override readonly context: NgDocBuilderContext,
		readonly parent: NgDocPageEntity,
	) {
		super(store, cache, context);
	}

	override get rootFiles(): string[] {
		return [];
	}

	override get buildCandidates(): NgDocEntity[] {
		return [this.parent];
	}

	@CachedFilesGetter()
	get outputPath(): string {
		return path.join(this.parent.folderPath, 'demo-assets.ts');
	}

	build(): Observable<NgDocBuildResult<NgDocComponentAsset>> {
		const objectExpression = this.parent.objectExpression;

		if (objectExpression) {
			this.parent.refreshDependencies();
			const classDeclarations = getDemoClassDeclarations(objectExpression);

			const componentAssets: NgDocComponentAsset = Object.keys(classDeclarations).reduce(
				(acc: NgDocComponentAsset, key: string) =>
					Object.assign(acc, { [key]: getComponentAssets(classDeclarations[key]) }),
				{},
			);

			return of({
				result: componentAssets,
				entity: this,
				toBuilderOutput: async (demoAssets: NgDocComponentAsset) => ({
					content: renderTemplate('./demo-assets.ts.nunj', { context: { demoAssets } }),
					filePath: this.outputPath,
				}),
				postBuildPlugins: [
					applyPlugin<NgDocComponentAsset, NgDocAsset[]>(forObjectValues(), () => [
						extractSnippetsPlugin(),
						removeLinesPlugin(),
						applyPlugin(forArrayItems(), (asset) => [
							applyPlugin(forObjectValue('code'), () => [
								wrapCodePlugin(asset.lang),
								processHtmlPlugin(),
							]),
							applyPlugin(forObjectValue('filePath'), () => [addToDependenciesPlugin()]),
						]),
					]),
				],
				postProcessPlugins: [
					applyPlugin<NgDocComponentAsset, NgDocAsset[]>(forObjectValues(), () => [
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
						applyPlugin(forArrayItems(), (_) => [
							applyPlugin(forObjectValue('code'), () => [postProcessHtmlPlugin()]),
						]),
					]),
				],
			});
		}

		throw new Error(`The entity "${this.id}" is not loaded.`);
	}
}
