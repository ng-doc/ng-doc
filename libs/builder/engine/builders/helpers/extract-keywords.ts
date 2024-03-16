import type { ExtractKeywordsConfig } from '@ng-doc/utils';

import { importEsm } from '../../../helpers';

type Utils = typeof import('@ng-doc/utils');

/**
 *
 * @param html
 * @param config
 */
export async function extractKeywords(
  html: string,
  config: ExtractKeywordsConfig,
): Promise<string> {
  const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

  return utils.extractKeywords(html, config);
}
