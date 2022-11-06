import * as fs from 'fs';
import * as path from 'path';

import {slash} from '../../../helpers';
import {GENERATED_MODULES_PATH} from '../../variables';
import {NgDocFileEntity} from './file.entity';

export abstract class NgDocModuleEntity<T> extends NgDocFileEntity<T> {
	abstract override parent?: NgDocModuleEntity<unknown>;
	/**
	 * File title of the module.
	 */
	abstract moduleFileName: string;

	/**
	 * The title of the module.
	 */
	abstract moduleName: string;

	/**
	 * Folder name in generated folder
	 */
	abstract folderName: string;

	get folderPath(): string {
		return path.join(this.parent?.folderPath ?? GENERATED_MODULES_PATH, this.folderName);
	}

	/**
	 * Returns paths to the module in generated folder
	 *
	 * @type {string}
	 */
	get modulePath(): string {
		return path.join(this.folderPath, this.moduleFileName);
	}
	/**
	 * Returns relative paths to the module in generated folder that could be used for import
	 *
	 * @type {string}
	 */
	get moduleImport(): string {
		return slash(path.relative(this.context.context.workspaceRoot, this.modulePath)).replace(/.ts$/, '');
	}

	override destroy(): void {
		super.destroy();
	}

	override removeArtifacts(): void {
		super.removeArtifacts();

		fs.rmSync(this.folderPath, { recursive: true, force: true });
	}
}
