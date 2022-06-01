import * as nunjucks from 'nunjucks';
import {Environment, lib} from 'nunjucks';
import {Observable, Subscriber} from 'rxjs';

import {NgDocRendererOptions} from '../interfaces';
import {TEMPLATES_PATH} from './variables';
import TemplateError = lib.TemplateError;

export class NgDocRenderer<T extends object> {
	constructor(private readonly context?: T) {}

	render(template: string, options?: NgDocRendererOptions<T>): Observable<string> {
		return new Observable((observer: Subscriber<string>) => {
			this.getEnvironment(options).render(
				template,
				options?.overrideContext ?? this.context,
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
		return this.getEnvironment(options).render(template, options?.overrideContext ?? this.context);
	}

	private getEnvironment(options?: NgDocRendererOptions<T>): Environment {
		return nunjucks.configure(options?.scope ?? TEMPLATES_PATH, {
			autoescape: false,
		});
	}
}
