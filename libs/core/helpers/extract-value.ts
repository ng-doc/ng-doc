import {NgDocExtractedValue} from '@ng-doc/core/types';

/**
 *
 * @param value
 */
export function extractValue(value: string): NgDocExtractedValue {
	try {
		return extractValueOrThrow(value);
	} catch {
		return '';
	}

}

/**
 *
 * @param value
 */
export function extractValueOrThrow(value: string): NgDocExtractedValue {
	return new Function(`return ${value}`)();
}
