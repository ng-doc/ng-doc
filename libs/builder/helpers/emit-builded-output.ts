import * as fs from 'fs';
import * as path from 'path';

import {NgDocBuildedOutput} from '../interfaces';

/**
 *
 * @param {...any} outputs
 */
export function emitBuildedOutput(...outputs: NgDocBuildedOutput[]): void {
	outputs.forEach((output: NgDocBuildedOutput) => {
		fs.mkdirSync(path.dirname(output.filePath), {recursive: true});
		fs.writeFileSync(output.filePath, output.output);
	});
}
