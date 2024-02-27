import type { ReplaceKeywordsConfig } from '@ng-doc/utils';

import { importEsm } from '../../../helpers';

type Utils = typeof import('@ng-doc/utils');

/**
 *
 * @param html
 * @param getKeyword
 * @param config
 */
export async function replaceKeywords(
  html: string,
  config: ReplaceKeywordsConfig,
): Promise<string> {
  const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

  return utils.replaceKeywords(html, config);
}
