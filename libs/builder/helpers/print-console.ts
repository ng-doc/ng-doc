import chalk from 'chalk';

export function printWarning(text?: string): void {
	text && console.log(`\n${chalk.blue('NgDoc:')} ${chalk.yellow(text)}`);
}
