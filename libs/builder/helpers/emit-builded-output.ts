import * as fs from 'fs';
import * as path from 'path';

import {NgDocBuiltOutput} from '../interfaces';

/**
 *
 * @param {...any} outputs
 */
export function emitBuildedOutput(...outputs: NgDocBuiltOutput[]): void {
	outputs.forEach((output: NgDocBuiltOutput) => {
		fs.mkdirSync(path.dirname(output.filePath), {recursive: true});
		fs.writeFileSync(output.filePath, output.output);
	});
}
