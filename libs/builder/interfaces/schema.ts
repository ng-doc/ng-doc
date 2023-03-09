import {NgDocConfiguration} from './configuration';

export interface NgDocSchema {
	browserTarget: string;
	main: string;
	/**
	 * @deprecated Please use `ng-doc.config.js` file instead. Check our configuration guide for more details.
	 */
	ngDoc?: NgDocConfiguration;
}
