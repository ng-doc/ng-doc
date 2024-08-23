import { NgVersion } from '../types';

/**
 *
 * @param version
 */
export function getNgHost(version?: NgVersion): string {
  const versionEndpoint: string = version ? `${version}.` : '';

  return `https://${versionEndpoint}angular.dev`;
}
