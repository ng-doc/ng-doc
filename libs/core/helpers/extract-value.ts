import {NgDocExtractedValue} from '@ng-doc/core/types';

/**
 *
 * @param value
 */
export function extractValue(value: string): NgDocExtractedValue {
	try {
		return new Function(`return ${value}`)();
	} catch {
		return '';
	}

}
