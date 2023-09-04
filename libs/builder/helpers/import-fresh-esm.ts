import * as fs from 'fs';
import * as path from 'path';

import { importEsm } from './import-esm';
import { posix } from './posix';

/**
 * Imports a module without caching it
 *
 * This is a workaround for the issue described here:
 * https://github.com/nodejs/modules/issues/307
 *
 * @param modulePath - The path to the module to import
 */
export async function importFreshEsm<T>(modulePath: string): Promise<T> {
	const filepath = path.resolve(modulePath);
	const fileContent = await fs.promises.readFile(filepath, 'utf8');
	const ext = path.extname(filepath);
	const extRegex = new RegExp(`\\${ext}$`);
	const newFilepath = `${filepath.replace(extRegex, '')}${Date.now()}${ext}`;

	await fs.promises.writeFile(newFilepath, fileContent);
	const module = await importEsm<T>(posix(newFilepath));

	fs.unlink(newFilepath, () => void 0);

	return module;
}
