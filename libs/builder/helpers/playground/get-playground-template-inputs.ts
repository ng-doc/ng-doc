import { NgDocPlaygroundProperties } from '@ng-doc/core';

/**
 *
 * @param declaration
 * @param properties
 */
export function getPlaygroundTemplateInputs(
	properties: NgDocPlaygroundProperties,
): Record<string, string> {
	return Object.keys(properties).reduce((inputs: Record<string, string>, property: string) => {
		const inputName: string = properties[property].inputName;

		inputs[inputName] = `properties['${property}']`;

		return inputs;
	}, {});
}
