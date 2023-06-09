import {NgResponse} from '../interfaces';
import {NgVersion} from '../types';
import {getNgHost} from './get-ng-host';

/**
 *
 * @param version
 */
export async function fetchDocs(version?: NgVersion): Promise<NgResponse> {
	return await fetch(`${getNgHost(version)}/generated/docs/app/search-data.json`).then((response: Response) =>
		response.json(),
	);
}
