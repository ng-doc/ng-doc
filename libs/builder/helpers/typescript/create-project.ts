import * as path from 'path';
import {ModuleKind, ModuleResolutionKind, Project, ProjectOptions} from 'ts-morph';

import {CACHE_PATH} from '../../engine/variables';

/**
 * Creates typescript project
 *
 * @param {ProjectOptions} options - Projects option to override
 * @returns {Project} - The project
 */
export function createProject(options?: ProjectOptions): Project {
	return new Project({
		...options,
		compilerOptions: {
			module: ModuleKind.CommonJS,
			sourceMap: false,
			incremental: true,
			declaration: false,
			skipLibCheck: true,
			noEmit: true,
			tsBuildInfoFile: path.join(CACHE_PATH, 'ng-doc.buildinfo.json'),
			moduleResolution: ModuleResolutionKind.NodeJs,
			isolatedModules: true,
			types: [],
			...options?.compilerOptions,
		},
		skipAddingFilesFromTsConfig: true,
		skipFileDependencyResolution: false,
		skipLoadingLibFiles: false,
	});
}
