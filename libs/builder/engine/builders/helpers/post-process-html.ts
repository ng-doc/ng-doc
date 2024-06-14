import type { PostProcessHtmlOutput } from '@ng-doc/utils';

import { importEsm } from '../../../helpers';

type Utils = typeof import('@ng-doc/utils');

/**
 *
 * @param html
 * @param config
 */
export async function postProcessHtml(html: string): Promise<PostProcessHtmlOutput> {
  const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

  return utils.postProcessHtml(html);
}
