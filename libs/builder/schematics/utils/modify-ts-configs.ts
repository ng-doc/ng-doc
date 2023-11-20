import { Tree } from '@angular-devkit/schematics';
import { JSONFile } from 'ng-morph';
import path from 'path';

/**
 *
 * @param tree
 * @param filePath
 * @param modifier
 */
export function modifyTsConfigs(
	tree: Tree,
	filePath: string,
	modifier: (json: JSONFile) => void,
): void {
	const json: JSONFile = new JSONFile(tree, filePath);
	const ext: string | undefined = json.get(['extends']);

	modifier(json);

	if (ext) {
		modifyTsConfigs(tree, path.join(path.dirname(filePath), ext), modifier);
	}
}
