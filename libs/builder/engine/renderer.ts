import * as fs from 'fs';
import * as nunjucks from 'nunjucks';
import {Environment, lib} from 'nunjucks';
import * as path from 'path';
import {Observable, Subscriber} from 'rxjs';
import {mapTo, tap} from 'rxjs/operators';

import {NgDocRendererOptions} from '../interfaces';
import {TEMPLATES_PATH} from './variables';
import TemplateError = lib.TemplateError;

export class NgDocRenderer<T extends object> {
	constructor(private readonly context?: T) {}

	render(template: string, options?: NgDocRendererOptions<T>): Observable<string> {
		return new Observable((observer: Subscriber<string>) => {
			const environment: Environment = nunjucks.configure(options?.scope ?? TEMPLATES_PATH, {
				autoescape: false,
			});
			environment.render(
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

	renderToFiled(template: string, filePath: string, options?: NgDocRendererOptions<T>): Observable<void> {
		return this.render(template, options).pipe(
			tap(() => fs.mkdirSync(path.dirname(filePath), {recursive: true})),
			tap((rendered: string) => fs.writeFileSync(filePath, rendered)),
			mapTo(void 0),
		);
	}

	renderToFolderd(template: string, folderPath: string, options?: NgDocRendererOptions<T>): Observable<void> {
		const fileName: string = path.basename(template).replace(/\.nunj$/, '');

		return this.render(template, options).pipe(
			tap(() => fs.mkdirSync(path.dirname(folderPath), {recursive: true})),
			tap((rendered: string) => fs.writeFileSync(path.join(folderPath, fileName), rendered)),
			mapTo(void 0),
		);
	}
}
