import { importEsm } from './import-esm';

export type Utils = typeof import('@ng-doc/utils');
export let UTILS: Utils;

/**
 *
 */
export async function importUtils(): Promise<void> {
  UTILS = await importEsm<Utils>('@ng-doc/utils');
}
