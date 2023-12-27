import type { NgDocHtmlProcessorConfig } from '@ng-doc/utils';

import { importEsm } from '../../../helpers';
import { Job } from '../../core';

type Utils = typeof import('@ng-doc/utils');

/**
 *
 * @param config
 */
export function processHtmlJob(config: NgDocHtmlProcessorConfig): Job<string> {
	return async (html: string) => {
		const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

		return utils.htmlProcessor(html, config);
	};
}
