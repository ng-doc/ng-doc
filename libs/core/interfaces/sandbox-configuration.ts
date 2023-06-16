import {OpenOptions, Project} from '@stackblitz/sdk/typings/interfaces';

export interface NgDocSandboxData {
	files?: Record<string, string>;
	dependencies?: Record<string, string>;
}

/**
 * The configuration for the Sandbox
 */
export interface NgDocSandboxConfiguration extends NgDocSandboxData {
	stackblitz?: NgDocStackblitzConfiguration;
	codesandbox?: NgDocCodesandboxConfiguration;
}

export interface NgDocStackblitzConfiguration extends NgDocSandboxData  {
	title?: string;
	description?: string;
	project?: Project;
	openOptions?: OpenOptions;
}

export type NgDocCodesandboxConfiguration = NgDocSandboxData;
