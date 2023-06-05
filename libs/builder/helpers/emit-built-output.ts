import * as fs from 'fs';
import * as path from 'path';

import {NgDocBuildOutput} from '../interfaces';

/**
 *
 * @param {...any} outputs
 */
export function emitBuiltOutput(outputs: NgDocBuildOutput[]): void {
	outputs.forEach((output: NgDocBuildOutput) => {
		fs.mkdirSync(path.dirname(output.filePath), {recursive: true});
		fs.writeFileSync(output.filePath, output.content);
	});
}
