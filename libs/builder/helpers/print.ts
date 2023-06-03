import {Spinner} from '@angular/cli/src/utilities/spinner';

const spinner: Spinner = new Spinner();

/**
 * Prints a progress message. If no message is passed, the message will be cleared.
 *
 * @param text - The message to print.
 */
export function printProgress(text?: string): void {
	spinner.stop();

	if (text) {
		spinner.text = `NgDoc: ${text}`;
		spinner.start();
	}
}

/**
 * Prints an error message.
 *
 * @param error - The error to print.
 */
export function printError(error: Error): void {
	spinner.fail(`NgDoc ${error}`);
}
