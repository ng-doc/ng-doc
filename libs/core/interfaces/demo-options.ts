/**
 * Possible options for `demo` action
 */
export interface NgDocDemoActionOptions {
	/** Display demo in the container (true by default) */
	container?: boolean;
	/** Specifies whether the code preview should be expanded (false by default) */
	expanded?: boolean;
	/** Tab name that should be opened by default */
	defaultTab?: string;
	/** List of tabs that should be displayed if they are not empty and exist */
	tabs?: string | string[];
}

/**
 * Possible options for `demoPane` action
 */
export interface NgDocDemoPaneActionOptions {
	/** Specifies whether the code preview should be expanded (false by default) */
	expanded?: boolean;
	/** Tab name that should be opened by default */
	defaultTab?: string;
	/** List of tabs that should be displayed if they are not empty and exist */
	tabs?: string | string[];
}
