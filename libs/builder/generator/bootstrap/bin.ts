#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runGeneratorCli } from './cli';
import { withPrerenderCommand } from './prerender-command';

const runNgDocCli = withPrerenderCommand(runGeneratorCli);

/** @internal Process boundary used by the executable and its signal tests. */
export interface GeneratorBinProcess {
  argv: string[];
  exitCode?: string | number;
  stderr: { write(text: string): unknown };
  once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  removeListener(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

type CliRunner = typeof runGeneratorCli;

export async function runGeneratorBin(
  processPort: GeneratorBinProcess = process,
  run: CliRunner = runNgDocCli,
): Promise<number> {
  const controller = new AbortController();
  const abort = (exitCode: 130 | 143): void => {
    if (!controller.signal.aborted) controller.abort({ exitCode });
  };
  const interrupt = (): void => abort(130);
  const terminate = (): void => abort(143);
  processPort.once('SIGINT', interrupt);
  processPort.once('SIGTERM', terminate);
  try {
    const code = await run(processPort.argv.slice(2), undefined, controller.signal);
    processPort.exitCode = code;
    return code;
  } finally {
    processPort.removeListener('SIGINT', interrupt);
    processPort.removeListener('SIGTERM', terminate);
  }
}

export function isGeneratorBinMain(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

/** @internal Converts an unexpected executable-boundary rejection to a joined exit. */
export async function runGeneratorBinMain(
  processPort: GeneratorBinProcess = process,
  run: CliRunner = runNgDocCli,
): Promise<void> {
  try {
    await runGeneratorBin(processPort, run);
  } catch (error) {
    processPort.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    processPort.exitCode = 1;
  }
}

if (isGeneratorBinMain(process.argv[1], import.meta.url)) {
  void runGeneratorBinMain();
}
