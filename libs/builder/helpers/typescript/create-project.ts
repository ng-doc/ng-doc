import {ModuleKind, Project, ProjectOptions} from 'ts-morph';

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
			...options?.compilerOptions,
		},
		skipAddingFilesFromTsConfig: true,
	});
}
