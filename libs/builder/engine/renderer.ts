import {objectKeys} from '@ng-doc/core';
import * as fs from 'fs';
import {Environment, ILoader, lib} from 'nunjucks';
import * as path from 'path';
import {Observable, Subscriber} from 'rxjs';
import {Node} from 'ts-morph';

import {NgDocRendererOptions} from '../interfaces';
import {NgDocBuilder} from './builder';
import * as filters from './template-filters';
import {TEMPLATES_PATH} from './variables';
import TemplateError = lib.TemplateError;
import {ObservableSet} from '../classes';

class NgDocRelativeLoader implements ILoader {
	constructor(
		private readonly path: string,
		private readonly dependenciesStore?: ObservableSet<string>,
	) {}
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

export class NgDocRenderer<T extends object> {
	constructor(
		private readonly builder: NgDocBuilder,
		private readonly context?: T,
		private readonly dependenciesStore?: ObservableSet<string>,
	) {}

	render(template: string, options?: NgDocRendererOptions<T>): Observable<string> {
		return new Observable((observer: Subscriber<string>) => {
			this.getEnvironment(options).render(
				template,
				this.getContext(options?.overrideContext),
				(err: TemplateError | null, data: string | null) => {
					if (err) {
						observer.error(err);
					} else {
						observer.next(data ?? '');
						observer.complete();
					}
				},
			);
		});
	}

	private getContext(context?: T): object {
		return {
			...(context ?? this.context)
		}
	}

	private getEnvironment(options?: NgDocRendererOptions<T>): Environment {
		let environment: Environment = new Environment(
			new NgDocRelativeLoader(options?.scope ?? TEMPLATES_PATH, this.dependenciesStore),
			{autoescape: false}
		);

		objectKeys(filters).forEach(
			(filter: keyof typeof filters) => (environment = environment.addFilter(filter, filters[filter])),
		);

		environment.addGlobal('Node', Node);
		environment.addGlobal('NgDocBuilder', this.builder);

		return environment;
	}
}
