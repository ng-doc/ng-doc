import * as fs from 'fs';
import * as path from 'path';
import * as webpack from 'webpack';

import {ASSETS_PATH, GENERATED_ASSETS_PATH} from '../engine/variables';

export class NgDocAssetsPlugin {
	apply(compiler: webpack.Compiler): void {
		compiler.hooks.compilation.tap('NgDocAssetsPlugin', (compilation: webpack.Compilation) => {
			compilation.hooks.processAssets.tap(
				{
					name: 'NgDocAssetsPlugin',
					stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
				},
				(assets: Record<string, unknown>) => {
					fs.readdir(GENERATED_ASSETS_PATH, (_err: unknown | null, files: string[]) => {
						files.forEach((file: string) => {
							const filePath: string = path.join(GENERATED_ASSETS_PATH, file);
							const fileContent: string = String(fs.readFileSync(filePath));

							assets[path.join(ASSETS_PATH, path.basename(file))] = {
								source: () => fileContent,
								size: () => fileContent.length,
							};
						});
					});
				},
			);
		});
	}
}
