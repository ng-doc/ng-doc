import * as fs from 'fs';
import * as path from 'path';

import { NgDocBuilderOutput } from '../interfaces';

/**
 *
 * @param {...any} outputs
 */
export function emitBuiltOutput(outputs: NgDocBuilderOutput[]): void {
	outputs.forEach((output: NgDocBuilderOutput) => {
		fs.mkdirSync(path.dirname(output.filePath), { recursive: true });
		fs.writeFileSync(output.filePath, output.content);
	});
}
