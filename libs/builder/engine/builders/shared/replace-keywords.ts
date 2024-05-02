import { importEsm } from '../../../helpers';
import { keywordsStore } from '../../core';

type Utils = typeof import('@ng-doc/utils');

/**
 *
 * @param html
 * @param getKeyword
 * @param config
 */
export async function replaceKeywords(html: string): Promise<string> {
  const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

  return utils.replaceKeywords(html, {
    getKeyword: keywordsStore.get.bind(keywordsStore),
  });
}
