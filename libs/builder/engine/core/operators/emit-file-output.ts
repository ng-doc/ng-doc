import fs from 'fs';
import path from 'path';
import { OperatorFunction } from 'rxjs';
import { tap } from 'rxjs/operators';

import { BuilderDone, BuilderError, FileOutput, isBuilderDone } from '../types';

/**
 * An operator function that emits file outputs.
 * @returns An OperatorFunction that can be used in an RxJS pipe.
 */
export function emitFileOutput(): OperatorFunction<
	BuilderDone<FileOutput> | BuilderError,
	BuilderDone<FileOutput> | BuilderError
> {
	return (source) => {
		return source.pipe(
			tap((state) => {
				if (isBuilderDone(state)) {
					emitFiles([state.result]);
				}
			}),
		);
	};
}

/**
 * Writes the content of each file in the provided array to the file system.
 * @param {FileOutput[]} files - An array of FileOutput objects to be written to the file system.
 */
function emitFiles(files: FileOutput[]): void {
	files.forEach((output: FileOutput) => {
		const fileContent = fs.existsSync(output.filePath) && fs.readFileSync(output.filePath, 'utf-8');

		if (fileContent !== output.content) {
			fs.mkdirSync(path.dirname(output.filePath), { recursive: true });
			fs.writeFileSync(output.filePath, output.content);
		}
	});
}
