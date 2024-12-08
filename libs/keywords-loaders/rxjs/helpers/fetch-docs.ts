import { RxjsResponse } from '../types';
import { getApiUrl } from './get-api-url';

/**
 * @param version rxjs version
 */
export async function fetchDocs(version?: string): Promise<RxjsResponse> {
  const manifestUrl = getApiUrl('generated/docs/api/api-list.json', version);

  return fetch(manifestUrl).then((response: Response) => response.json());
}
