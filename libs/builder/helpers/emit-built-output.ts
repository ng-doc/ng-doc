import * as fs from 'fs';
import * as path from 'path';

import { NgDocBuilderOutput } from '../interfaces';

/**
 * Emits the built output to the file system.
 *
 * @param outputs - The outputs to emit.
 */
export function emitBuiltOutput(outputs: NgDocBuilderOutput[]): void {
	outputs.forEach((output: NgDocBuilderOutput) => {
		const fileContent = fs.existsSync(output.filePath) && fs.readFileSync(output.filePath, 'utf-8');

		if (fileContent !== output.content) {
			fs.mkdirSync(path.dirname(output.filePath), { recursive: true });
			fs.writeFileSync(output.filePath, output.content);
		}
	});
}
