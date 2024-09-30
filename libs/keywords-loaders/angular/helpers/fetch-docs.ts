import fetch, { Response } from 'node-fetch';

import { NgResponse, NgVersion } from '../types';
import { getNgHost } from './get-ng-host';

/**
 *
 * @param version
 */
export async function fetchDocs(version?: NgVersion): Promise<NgResponse> {
  const manifestUrl = `${getNgHost(version)}/assets/api/manifest.json`;

  return fetch(manifestUrl).then((response: Response) => response.json());
}
