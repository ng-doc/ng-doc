import { RxjsVersion } from '../types';
import { getRxjsHost } from './get-rxjs-host';

/**
 * @param path type api path from rxjs api manifest
 * @param version version of rxjs
 */
export function getApiUrl(path: string, version?: RxjsVersion): string {
  return `${getRxjsHost(version)}/${path}`;
}
