import { RxjsVersion } from '../types';

/**
 * @param version rxjs version
 */
export function getRxjsHost(version?: RxjsVersion): string {
  return `https://${version ? `${version}.` : ''}rxjs.dev`;
}
