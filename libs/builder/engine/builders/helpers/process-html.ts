import type { NgDocHtmlProcessorConfig } from '@ng-doc/utils';

import { importEsm } from '../../../helpers';
type Utils = typeof import('@ng-doc/utils');

/**
 *
 * @param html
 * @param config
 */
export async function processHtml(html: string, config: NgDocHtmlProcessorConfig): Promise<string> {
  const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

  return utils.htmlProcessor(html, config);
}
