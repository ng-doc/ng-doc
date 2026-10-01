/**
 * Child program for the harness: a reporter on the real `process.stderr`/`process.stdout`,
 * fed by a simulated scenario. The PTY and pipe checks run it bundled (esbuild), so detection sees
 * the real stream (`isTTY`, `columns`) and the real environment.
 *
 * Usage: node child.mjs <scenario> [instant|real] [scale] [host-sigint]
 *
 * `host-sigint`: the program handles SIGINT itself (prints a line and exits with code 7), as a
 * host with its own handler does.
 */
import { createProgressReporter } from '../../reporter';
import { FakeClock } from './fake-io';
import { replay, replayRealTime, SCENARIOS } from './simulate';

async function main(): Promise<void> {
  const [name = 'cold-build', timing = 'instant', scale = '1', host] = process.argv.slice(2);
  if (host === 'host-sigint')
    process.on('SIGINT', () => {
      process.stderr.write('host: stopped\n');
      process.exit(7);
    });
  const create = SCENARIOS[name];
  if (!create) throw new Error(`Unknown scenario ${name}`);
  const writer = {
    line: (text: string) => void process.stderr.write(`${text}\n`),
    summary: (text: string) => void process.stdout.write(`${text}\n`),
    live: process.stderr,
  };
  if (timing === 'real') {
    const reporter = createProgressReporter({ writer });
    await replayRealTime(create(), reporter, Number(scale));
    return;
  }
  const clock = new FakeClock();
  const reporter = createProgressReporter({ writer, clock });
  replay(create(), reporter, clock);
}

main().catch((error: unknown) => {
  process.stderr.write(`child failed: ${String(error)}\n`);
  process.exitCode = 1;
});
