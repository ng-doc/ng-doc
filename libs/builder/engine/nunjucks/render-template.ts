import {objectKeys} from '@ng-doc/core';
import * as fs from 'fs';
import {Environment, ILoader, LoaderSource} from 'nunjucks';
import * as path from 'path';
import {Node} from 'ts-morph';

import {ObservableSet} from '../../classes';
import {NgDocRendererOptions} from '../../interfaces';
import {TEMPLATES_PATH} from '../variables';
import {NgDocIndexExtension} from './extentions';
import * as filters from './filters';

class NgDocRelativeLoader implements ILoader {
	constructor(private readonly path: string, private readonly dependenciesStore?: ObservableSet<string>) {}

	getSource(name: string): LoaderSource {
		const fullPath: string = path.join(this.path, name);

		this.dependenciesStore?.add(fullPath);

		return {
			src: fs.readFileSync(fullPath, 'utf-8'),
			path: fullPath,
			noCache: true,
		};
	}
}

/**
 * Renders a template with the given options via Nunjucks.
 *
 * @param template - The template path to render.
 * @param options - The options to render the template with.
 */
export function renderTemplate<T extends object>(template: string, options?: NgDocRendererOptions<T>): string {
	let environment: Environment = new Environment(
		new NgDocRelativeLoader(options?.scope ?? TEMPLATES_PATH, options?.dependenciesStore),
		{autoescape: false},
	);

	if (options?.filters !== false) {
		objectKeys(filters).forEach(
			(filter: keyof typeof filters) => (environment = environment.addFilter(filter, filters[filter])),
		);

		environment.addGlobal('Node', Node);
	}
	environment.addExtension('NgDocIndexExtension', new NgDocIndexExtension());

	return environment.render(template, options?.context);
}
