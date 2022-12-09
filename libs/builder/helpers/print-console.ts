import chalk from 'chalk';

export function printWarning(text?: string): void {
	text && process.stdout.write(`\n${chalk.blue('NgDoc:')} ${chalk.yellow(text)}`);
}
