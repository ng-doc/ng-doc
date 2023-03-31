import {objectKeys} from '@ng-doc/core';
import * as fs from 'fs';
import {Environment, ILoader} from 'nunjucks';
import * as path from 'path';
import {Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {Node} from 'ts-morph';

import {ObservableSet} from '../classes';
import {NgDocRendererOptions} from '../interfaces';
import {NgDocIndexExtension} from './extentions/index.extension';
import * as filters from './template-filters';
import {TEMPLATES_PATH} from './variables';

class NgDocRelativeLoader implements ILoader {
	constructor(private readonly path: string, private readonly dependenciesStore?: ObservableSet<string>) {}
	getSource(name: string) {
		const fullPath: string = path.join(this.path, name);

		this.dependenciesStore?.add(fullPath);

		return {
			src: fs.readFileSync(fullPath, 'utf-8'),
			path: fullPath,
			noCache: true,
		};
	}
}

export class NgDocRenderer {
	render<T extends object>(template: string, options?: NgDocRendererOptions<T>): Observable<string> {
		return of(null).pipe(map(() => this.renderSync(template, options)));
	}

	renderSync<T extends object>(template: string, options?: NgDocRendererOptions<T>): string {
		return this.getEnvironment(options).render(template, options?.context);
	}

	private getEnvironment<T extends object>(options?: NgDocRendererOptions<T>): Environment {
		let environment: Environment = new Environment(
			new NgDocRelativeLoader(options?.scope ?? TEMPLATES_PATH, options?.dependenciesStore),
			{autoescape: false},
		);

		objectKeys(filters).forEach(
			(filter: keyof typeof filters) => (environment = environment.addFilter(filter, filters[filter])),
		);

		environment.addGlobal('Node', Node);
		environment.addExtension('NgDocIndexExtension', new NgDocIndexExtension())

		return environment;
	}
}
