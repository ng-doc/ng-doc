import * as fs from 'fs';
import {DirectoryItems} from 'mock-fs/lib/filesystem';
import path from 'path';

/**
 *
 */
export function getMockedFileSystem(): DirectoryItems {
	const currentFolder: string = __dirname;

	return {
		...collectFiles(path.join(currentFolder, 'mocks/app')),
	};
}

/**
 *
 * @param p
 */
function collectFiles(p: string): DirectoryItems {
	const files: string[] = fs.readdirSync(p);

	return files.reduce((fileSystem: DirectoryItems, file: string) => {
		const fPath: string = path.join(p, file);

		fileSystem[file] = fs.lstatSync(fPath).isDirectory()
			? collectFiles(fPath)
			: fs.readFileSync(fPath, {encoding: 'utf8'});

		return fileSystem;
	}, {});
}
