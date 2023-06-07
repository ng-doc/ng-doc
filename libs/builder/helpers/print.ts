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
 * Prints an info message.
 *
 * @param info - The info to print.
 */
export function printInfo(info: string): void {
	spinner.info(info);
}

/**
 * Prints a warning message.
 *
 * @param warn - The warning to print.
 */
export function printWarning(warn: string): void {
	spinner.warn(warn);
}

/**
 * Prints an error message.
 *
 * @param error - The error to print.
 */
export function printError(error: string): void {
	spinner.fail(error);
}
