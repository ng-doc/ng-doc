import {NgDocActionOutput} from '../../interfaces';
import {NgDocAction} from '../../types';

/**
 *	Render API table for typescript object
 *
 * @param {string} sourcePath - Path to typescript file
 * @returns {NgDocAction} - The action output
 */
export function apiAction(sourcePath: string): NgDocAction {
	return (): NgDocActionOutput => {
		return {output: ``};
	};
}
