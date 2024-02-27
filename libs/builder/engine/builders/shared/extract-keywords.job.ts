import type { ExtractKeywordsConfig } from '@ng-doc/utils';

import { importEsm } from '../../../helpers';
import { Job } from '../../core';

type Utils = typeof import('@ng-doc/utils');

/**
 *
 * @param config
 * @param addUsedKeyword
 */
export function extractKeywordsJob(config: ExtractKeywordsConfig): Job<string> {
  return async (html: string) => {
    const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

    return utils.extractKeywords(html, config);
  };
}
