import * as fs from 'fs';
import * as nunjucks from 'nunjucks';
import * as path from 'path';

import {NgDocRendererOptions} from '../interfaces';
import {TEMPLATES_PATH} from './variables';

export class NgDocRenderer<T extends object> {
	constructor(private readonly context?: T) {}

	async render(template: string, options?: NgDocRendererOptions<T>): Promise<string> {
		nunjucks.configure(options?.scope ?? TEMPLATES_PATH, {
			autoescape: false,
		});

		return nunjucks.render(template, options?.overrideContext ?? this.context);
	}

	async renderToFile(template: string, filePath: string, options?: NgDocRendererOptions<T>): Promise<void> {
		const rendered: string = await this.render(template, options);

		fs.mkdirSync(path.dirname(filePath), {recursive: true});
		fs.writeFileSync(filePath, rendered);
	}

	async renderToFolder(template: string, folderPath: string, options?: NgDocRendererOptions<T>): Promise<void> {
		const rendered: string = await this.render(template, options);
		const fileName: string = path.basename(template).replace(/\.nunj$/, '');

		fs.mkdirSync(path.dirname(folderPath), {recursive: true});
		fs.writeFileSync(path.join(folderPath, fileName), rendered);
	}
}
