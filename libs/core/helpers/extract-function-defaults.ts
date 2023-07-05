import {FunctionType} from '../types';
import {extractValue} from './extract-value';

/**
 * Extracts the default values of a function parameters
 *
 * @param fn - Function to extract the default values from
 */
export function extractFunctionDefaults(fn: FunctionType<unknown>): Record<string, unknown> {
	const name: string = fn.name || 'function';

	return (
		fn
			.toString()
			// Get the parameters declaration between the parenthesis
			.match(new RegExp(`^${name}\\s*[^\\(]*\\(\\s*([^\\)]*)\\)`, 'm'))?.[1]
			// Get rid of comments
			.replace(/(\/\*[\s\S]*?\*\/)/gm, '')
			.split(',')
			// Convert it into an object
			.reduce(function (parameters: Record<string, unknown>, param: string) {
				// Split parameter name from value
				const paramMatch = param.match(/([_$a-zA-Z][^=]*)(?:=([^=]+))?/);

				if (paramMatch) {
					// Eval each default value, to get strings, variable refs, etc.
					parameters[paramMatch[1].trim()] = extractValue(paramMatch[2]);
				}

				return parameters;
			}, {}) ?? {}
	);
}
