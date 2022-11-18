import {objectKeys} from '@ng-doc/core';
import * as nunjucks from 'nunjucks';
import {Environment, lib} from 'nunjucks';
import {Observable, Subscriber} from 'rxjs';

import {NgDocRendererOptions} from '../interfaces';
import * as filters from './template-filters';
import {TEMPLATES_PATH} from './variables';
import TemplateError = lib.TemplateError;
import {Node} from 'ts-morph';

import {NgDocBuilder} from './builder';

export class NgDocRenderer<T extends object> {
	constructor(
		private readonly builder: NgDocBuilder,
		private readonly context?: T,
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
						data && observer.next(data);
						observer.complete();
					}
				},
			);
		});
	}

	renderSync(template: string, options?: NgDocRendererOptions<T>): string {
		return this.getEnvironment(options).render(template, this.getContext(options?.overrideContext));
	}

	private getContext(context?: T): object {
		return {
			...(context ?? this.context)
		}
	}

	private getEnvironment(options?: NgDocRendererOptions<T>): Environment {
		let environment: Environment = nunjucks.configure(options?.scope ?? TEMPLATES_PATH, {
			autoescape: false,
		});

		objectKeys(filters).forEach(
			(filter: keyof typeof filters) => (environment = environment.addFilter(filter, filters[filter])),
		);

		environment.addGlobal('Node', Node);
		environment.addGlobal('NgDocBuilder', this.builder);

		return environment;
	}
}
