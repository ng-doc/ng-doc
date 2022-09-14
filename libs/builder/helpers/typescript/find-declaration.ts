import * as fs from 'fs';
import * as path from 'path';
import {Node, Project, SourceFile, Symbol} from 'ts-morph';

import {NgDocPageEntity} from '../../engine/entities/page.entity';
import {NgDocPathAnchor} from '../../interfaces';
import {extractPathAnchor} from '../extract-path-anchor';

/**
 *	Finds the declaration of a given source path.
 *
 * @param {Project} project - The typescript project
 * @param {NgDocPageEntity} scope - The scope of the current page
 * @param {string} sourcePath - The source path to find the declaration
 * @returns {Node} The declaration node
 */
export function findDeclaration(project: Project, scope: string, sourcePath: string): Node {
	const anchor: NgDocPathAnchor = extractPathAnchor(sourcePath);
	const filePath: string = path.join(scope, anchor.path);

	if (!fs.existsSync(filePath)) {
		throw new Error(
			`File ${filePath} does not exist, please check your path to the file, or change the scope property in your page definition.`,
		);
	}

	project.getSourceFile(filePath)?.refreshFromFileSystemSync();

	const sourceFile: SourceFile = project.getSourceFile(filePath) ?? project.addSourceFileAtPath(filePath);
	const symbol: Symbol | undefined = sourceFile.getLocal(anchor.anchor);
	const declaration: Node | undefined = symbol?.getDeclarations()[0];

	if (!declaration) {
		throw new Error(`Declaration for name ${anchor.anchor} does not exist in ${filePath}`);
	}

	return declaration;
}
