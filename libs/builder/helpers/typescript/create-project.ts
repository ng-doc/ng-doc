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
			/*
				true value increases the speed, but thn it's not possible to resolve imports,
				TODO: maybe as a workaround it's possible to add all source files that we need to the Project
			 */
			noResolve: false,
			isolatedModules: true,
			types : [],
			...options?.compilerOptions,
		},
		skipAddingFilesFromTsConfig: true,
	});
}
