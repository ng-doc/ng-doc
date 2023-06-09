/**
 * List of possible options for the NgDoc keywords loader.
 */
export interface NgDocKeywordsLoaderOptions {
	/**
	 * The URL endpoint of the NgDoc documentation. (e.g. https://ng-doc.com)
	 */
	endpoint: string;
	/**
	 * The path to the assets folder of the NgDoc documentation. (default: `/assets/ng-doc`)
	 */
	assetsPath?: string;
	/**
	 * Whether to load the keywords for the external guides. (default: `false`)
	 */
	loadGuides?: boolean;
	/**
	 * Defines the prefix to use for the external guides.
	 * (e.g. if the external guides have keyword `Installation`
	 * and you set `guidesPrefix` to `External`, the keyword will be `ExternalInstallation`)
	 */
	guidesPrefix?: string;
}
