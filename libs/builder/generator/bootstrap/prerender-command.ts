import path from 'node:path';

import type { GeneratorCliIO } from './cli';

/** The part of the Vite entry (`vite/index.js`) the command uses. */
export interface PrerenderViteModule {
  buildNgDocViteApplication(options: {
    configFile: string;
    outputPath: string;
    mode?: string;
    routes?: readonly string[];
    routeTimeoutMs?: number;
    discoverRoutes?: boolean;
    skipBuild?: boolean;
    prerender?: boolean;
    log?: (message: string) => void;
    signal?: AbortSignal;
  }): Promise<{ prerendered?: { routes: readonly unknown[] } }>;
}

type CliRunner = (
  argv: readonly string[],
  io?: GeneratorCliIO,
  signal?: AbortSignal,
) => Promise<number>;

export const PRERENDER_USAGE = `Usage:
  ng-doc prerender --vite-config <path> --output-path <path> [options]

Builds a Vite + NgDoc application for production (the browser and server bundles) and prerenders
every route into <output-path>/browser. The Vite configuration must use
createNgDocApplicationPlugin with a server entry. Requires vite and @analogjs/vite-plugin-angular.

Options:
  --vite-config <path>   The Vite configuration file
  --output-path <path>   Output: browser/, server/server.mjs and prerendered-routes.json
  --mode <mode>          The Vite mode (default: production)
  --routes <a,b,...>     Routes prerendered in addition to the discovered ones
  --route-timeout <ms>   Fail a route that takes longer to render (default: no limit)
  --no-discover          Prerender only the --routes, without enumerating the router configuration
  --skip-build           Prerender an existing output without building it again
`;

const defaultIo: GeneratorCliIO = {
  cwd: () => process.cwd(),
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

// Loaded at run time by URL, so the CLI never bundles or requires Vite for its other commands.
const loadVite = (): Promise<PrerenderViteModule> =>
  import(new URL('../vite/index.js', import.meta.url).href) as Promise<PrerenderViteModule>;

function parse(argv: readonly string[], io: GeneratorCliIO) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') return 'help' as const;
    if (token === '--no-discover' || token === '--skip-build') {
      flags.add(token);
      continue;
    }
    if (
      !['--vite-config', '--output-path', '--mode', '--routes', '--route-timeout'].includes(token)
    ) {
      throw new Error(`Unknown option: ${token}`);
    }
    const value = argv[++index];
    if (value === undefined || value.startsWith('--') || value.includes('\0')) {
      throw new Error(`Missing value for ${token}.`);
    }
    if (values.has(token)) throw new Error(`Duplicate option: ${token}`);
    values.set(token, value);
  }
  const required = (name: string) => {
    const value = values.get(name);
    if (!value) throw new Error(`${name} is required.`);
    return path.resolve(io.cwd(), value);
  };
  const routes = values
    .get('--routes')
    ?.split(',')
    .map((route) => route.trim())
    .filter(Boolean);
  const timeout = values.get('--route-timeout');
  if (timeout !== undefined && !/^[1-9]\d*$/.test(timeout)) {
    throw new Error('--route-timeout must be a positive number of milliseconds.');
  }
  return {
    configFile: required('--vite-config'),
    outputPath: required('--output-path'),
    ...(values.has('--mode') ? { mode: values.get('--mode')! } : {}),
    ...(routes ? { routes } : {}),
    ...(timeout ? { routeTimeoutMs: Number(timeout) } : {}),
    discoverRoutes: !flags.has('--no-discover'),
    skipBuild: flags.has('--skip-build'),
    prerender: true,
  };
}

/**
 * `ng-doc prerender`: the Vite engine's production build with prerendering.
 */
export async function runPrerenderCommand(
  argv: readonly string[],
  io: GeneratorCliIO = defaultIo,
  signal: AbortSignal = new AbortController().signal,
  load: () => Promise<PrerenderViteModule> = loadVite,
): Promise<number> {
  let options: Exclude<ReturnType<typeof parse>, 'help'>;
  try {
    const parsed = parse(argv, io);
    if (parsed === 'help') {
      io.stdout(PRERENDER_USAGE);
      return 0;
    }
    options = parsed;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n${PRERENDER_USAGE}`);
    return 2;
  }
  try {
    const vite = await load();
    await vite.buildNgDocViteApplication({
      ...options,
      log: (message) => io.stdout(`${message}\n`),
      signal,
    });
    return 0;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return signal.aborted ? 130 : 1;
  }
}

/**
 * The `ng-doc` executable's commands: `prerender`, then everything the generator CLI runs.
 */
export function withPrerenderCommand(run: CliRunner): CliRunner {
  // `io` and `signal` pass through untouched: the generator CLI has its own defaults.
  return async (argv, io, signal) => {
    if (argv[0] === 'prerender') return runPrerenderCommand(argv.slice(1), io, signal);
    const code = await run(argv, io, signal);
    if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
      (io ?? defaultIo).stdout('\nVite engine:\n  ng-doc prerender --help\n');
    }
    return code;
  };
}
