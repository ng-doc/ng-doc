import * as path from 'path';
import * as fs from 'fs';
import * as ejs from 'ejs';
import {TEMPLATES_PATH} from './variables';
import {NgDocRendererOptions} from './interfaces';

export class NgDocRenderer<T = any> {
    constructor(private readonly context?: T) {}

    async render(template: string, options?: NgDocRendererOptions<T>): Promise<string> {
        const templatePath: string = options?.fullPath ? template : path.join(TEMPLATES_PATH, template);

        return await ejs.renderFile(templatePath, options?.overrideContext ?? this.context);
    }

    async renderToFile(template: string, filePath: string, options?: NgDocRendererOptions<T>): Promise<void> {
        const rendered: string = await this.render(template, options);

        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        fs.writeFileSync(filePath, rendered);
    }

    async renderToFolder(template: string, folderPath: string, options?: NgDocRendererOptions<T>): Promise<void> {
        const rendered: string = await this.render(template, options);
        const fileName: string = path.basename(template).replace(/\.ejs$/, '');

        fs.mkdirSync(path.dirname(folderPath), {recursive: true});
        fs.writeFileSync(path.join(folderPath, fileName), rendered);
    }
}
