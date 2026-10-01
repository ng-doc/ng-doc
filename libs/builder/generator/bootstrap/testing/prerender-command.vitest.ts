import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type PrerenderViteModule,
  PRERENDER_USAGE,
  runPrerenderCommand,
  withPrerenderCommand,
} from '../prerender-command';

function io(cwd: string = '/workspace') {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      cwd: () => cwd,
      stdout: (text: string) => out.push(text),
      stderr: (text: string) => err.push(text),
    },
    out,
    err,
  };
}

function vite(result: Awaited<ReturnType<PrerenderViteModule['buildNgDocViteApplication']>> = {}) {
  const buildNgDocViteApplication = vi.fn(
    async (options: Parameters<PrerenderViteModule['buildNgDocViteApplication']>[0]) => {
      options.log?.('Prerendered 2 route(s)');
      return result;
    },
  );
  return { buildNgDocViteApplication, load: vi.fn(async () => ({ buildNgDocViteApplication })) };
}

describe('ng-doc prerender', () => {
  it('builds and prerenders with paths resolved against the working directory', async () => {
    const { io: port, out } = io();
    const fake = vite();
    const signal = new AbortController().signal;
    expect(
      await runPrerenderCommand(
        [
          '--vite-config',
          'vite.config.mjs',
          '--output-path',
          'dist/site',
          '--mode',
          'staging',
          '--routes',
          '/a, /b,',
          '--route-timeout',
          '5000',
        ],
        port,
        signal,
        fake.load,
      ),
    ).toBe(0);
    expect(fake.buildNgDocViteApplication).toHaveBeenCalledWith({
      configFile: path.resolve('/workspace', 'vite.config.mjs'),
      outputPath: path.resolve('/workspace', 'dist/site'),
      mode: 'staging',
      routes: ['/a', '/b'],
      routeTimeoutMs: 5000,
      discoverRoutes: true,
      skipBuild: false,
      prerender: true,
      log: expect.any(Function),
      signal,
    });
    expect(out).toEqual(['Prerendered 2 route(s)\n']);

    await runPrerenderCommand(
      ['--vite-config', 'v', '--output-path', 'o', '--no-discover', '--skip-build'],
      port,
      signal,
      fake.load,
    );
    expect(fake.buildNgDocViteApplication).toHaveBeenLastCalledWith(
      expect.objectContaining({ discoverRoutes: false, skipBuild: true }),
    );
    expect(fake.buildNgDocViteApplication.mock.lastCall![0]).not.toHaveProperty('mode');
  });

  it('prints its usage and rejects invalid arguments', async () => {
    const help = io();
    expect(await runPrerenderCommand(['--help'], help.io)).toBe(0);
    expect(help.out).toEqual([PRERENDER_USAGE]);
    for (const [argv, message] of [
      [['--vite-config', 'v'], '--output-path is required.'],
      [['--output-path', 'o'], '--vite-config is required.'],
      [['--bogus'], 'Unknown option: --bogus'],
      [['--vite-config'], 'Missing value for --vite-config.'],
      [['--vite-config', '--output-path'], 'Missing value for --vite-config.'],
      [['--vite-config', 'a', '--vite-config', 'b'], 'Duplicate option: --vite-config'],
      [
        ['--vite-config', 'a', '--output-path', 'o', '--route-timeout', '0'],
        '--route-timeout must be a positive number of milliseconds.',
      ],
    ] as const) {
      const invalid = io();
      expect(await runPrerenderCommand(argv, invalid.io, undefined, vi.fn())).toBe(2);
      expect(invalid.err[0]).toBe(`${message}\n${PRERENDER_USAGE}`);
    }
  });

  it('reports build failures and aborts', async () => {
    const failed = io();
    const load = vi.fn(async () => ({
      buildNgDocViteApplication: vi.fn(async () => {
        throw new Error('[NGDOC_PRERENDER_FAILED] broken');
      }),
    }));
    const argv = ['--vite-config', 'v', '--output-path', 'o'];
    expect(await runPrerenderCommand(argv, failed.io, undefined, load)).toBe(1);
    expect(failed.err).toEqual(['[NGDOC_PRERENDER_FAILED] broken\n']);
    const controller = new AbortController();
    controller.abort();
    const aborted = io();
    expect(
      await runPrerenderCommand(argv, aborted.io, controller.signal, async () => {
        throw 'vite is not installed';
      }),
    ).toBe(130);
    expect(aborted.err).toEqual(['vite is not installed\n']);
  });

  it('dispatches prerender and adds its line to the generator help', async () => {
    const run = vi.fn(async () => 7);
    const cli = withPrerenderCommand(run);
    const help = io();
    expect(await cli(['--help'], help.io)).toBe(7);
    expect(help.out).toEqual(['\nVite engine:\n  ng-doc prerender --help\n']);
    expect(await cli([], help.io)).toBe(7);
    expect(await cli(['-h'], help.io)).toBe(7);
    expect(await cli(['generate', '--project', 'x'])).toBe(7);
    // The generator CLI keeps its own defaults for omitted arguments.
    expect(run).toHaveBeenLastCalledWith(['generate', '--project', 'x'], undefined, undefined);
    const usage = io();
    expect(await cli(['prerender', '--help'], usage.io)).toBe(0);
    expect(usage.out).toEqual([PRERENDER_USAGE]);
    expect(run).toHaveBeenCalledTimes(4);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await cli(['--help'])).toBe(7);
      expect(write).toHaveBeenCalledWith('\nVite engine:\n  ng-doc prerender --help\n');
      expect(await cli(['prerender', '-h'])).toBe(0);
      expect(write).toHaveBeenLastCalledWith(PRERENDER_USAGE);
    } finally {
      write.mockRestore();
    }
  });
});
