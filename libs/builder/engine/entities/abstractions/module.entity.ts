import * as path from 'path';

import { posix } from '../../../helpers';
import { CachedFilesGetter } from '../cache';
import { NgDocFileEntity } from './file.entity';

export abstract class NgDocModuleEntity<TTarget> extends NgDocFileEntity<TTarget> {
	/**
	 * Title of the module file.
	 */
	readonly moduleFileName: string = 'module.ts';

	abstract override parent?: NgDocModuleEntity<unknown>;

	/**
	 * Folder name in generated folder
	 */
	abstract folderName: string;

	get folderPath(): string {
		return path.join(this.parent?.folderPath ?? this.context.guidesPath, this.folderName);
	}

	/**
	 * Returns paths to the module in generated folder
	 *
	 * @type {string}
	 */
	@CachedFilesGetter()
	get modulePath(): string {
		return path.join(this.folderPath, this.moduleFileName);
	}

	/**
	 * Returns relative paths to the module in generated folder that could be used for import
	 *
	 * @type {string}
	 */
	get moduleImport(): string {
		return posix(path.relative(this.context.context.workspaceRoot, this.modulePath)).replace(
			/.ts$/,
			'',
		);
	}

	override destroy(): void {
		super.destroy();
	}

	override removeArtifacts(): void {
		super.removeArtifacts();
	}
}
