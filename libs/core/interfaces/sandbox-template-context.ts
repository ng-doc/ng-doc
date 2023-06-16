import {NgDocSandbox} from '../types';

export interface NgDocSandboxTemplateContext {
	sandbox: NgDocSandbox;
	componentName: string;
	componentSelector: string;
	componentImportPath: string;
}
