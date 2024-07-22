import { NgVersion } from '../types';
import { getNgHost } from './get-ng-host';

/**
 *
 * @param packageName
 * @param pageName
 * @param version
 */
export function getApiUrl(packageName: string, pageName: string, version?: NgVersion): string {
  const packageNameWithoutPrefix = packageName.replace('@angular/', '');

  return `${getNgHost(version)}/api/${packageNameWithoutPrefix}/${pageName}`;
}
