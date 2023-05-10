import {Spinner} from '@angular/cli/src/utilities/spinner';

let spinner: Spinner;

/**
 * Prints a progress message. If no message is passed, the message will be cleared.
 *
 * @param text - The message to print.
 */
export function printProgress(text?: string): void {
	spinner?.stop();

	if (text) {
		spinner = new Spinner(`NgDoc: ${text}`);
		spinner.start();
	}
}
