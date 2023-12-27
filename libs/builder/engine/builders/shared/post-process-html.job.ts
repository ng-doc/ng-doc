import type { NgDocHtmlPostProcessorConfig } from '@ng-doc/utils';

import { importEsm } from '../../../helpers';
import { Job } from '../../core';

type Utils = typeof import('@ng-doc/utils');

/**
 *
 * @param config
 */
export function postProcessHtmlJob(config: NgDocHtmlPostProcessorConfig): Job<string> {
	return async (html: string) => {
		const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

		return utils.htmlPostProcessor(html, config);
	};
}
