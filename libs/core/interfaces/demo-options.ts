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
	/** If specified, fullscreen button will be displayed and will navigate to the specified route */
	fullscreenRoute?: string;
	/** List of tabs that should be displayed if they are not empty and exist */
	tabs?: string | string[];
	/** Class name that should be added to the container */
	class?: string | string[];
}

/**
 * Possible options for `demoPane` action
 */
export interface NgDocDemoPaneActionOptions {
	/** Specifies whether the code preview should be expanded (false by default) */
	expanded?: boolean;
	/** Tab name that should be opened by default */
	defaultTab?: string;
	/** If specified, fullscreen button will be displayed and will navigate to the specified route */
	fullscreenRoute?: string;
	/** List of tabs that should be displayed if they are not empty and exist */
	tabs?: string | string[];
	/** Class name that should be added to the container */
	class?: string | string[];
}
