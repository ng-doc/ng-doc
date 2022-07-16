import {extractValue, objectKeys} from '@ng-doc/core';

/**
 *
 * @param properties
 */
export function extractProperties(properties: Record<string, unknown>): Record<string, unknown> {
	objectKeys(properties).forEach((key: string) => properties[key] = extractValue(String(properties[key])));

	return properties
}
