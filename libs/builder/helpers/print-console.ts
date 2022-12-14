import chalk from 'chalk';

/**
 *
 * @param text
 */
export function printWarning(text?: string): void {
	text && console.log(`\n${chalk.blue('NgDoc:')} ${chalk.yellow(text)}`);
}
