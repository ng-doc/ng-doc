/**
 * A real Angular builder run for native-smoke.integration.ts, in a process the test owns: the NgDoc
 * runner scheduled by a real Architect, with the real `buildApplication`/`executeDevServerBuilder`
 * and theme transformer, and a fixed generator session. Each builder output is printed as one
 * `NGDOC_SMOKE <json>` line. On stdin, `fatal` reports a watcher error to the runner and `stop`
 * stops the run as the Angular CLI does on Ctrl-C. The process is never exited explicitly: it must
 * end on its own once the run is over, which proves that nothing Angular started is left running.
 * Arguments: `application|dev-server <fixture root> <restore-theme.js path> [port]`.
 */
import { buildApplication, executeDevServerBuilder } from '@angular/build';
import { type BuilderContext, Architect, createBuilder } from '@angular-devkit/architect';
import { TestingArchitectHost } from '@angular-devkit/architect/testing/index.js';
import { json } from '@angular-devkit/core';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

import type { BuildEvent, BuildResult, BuildSession, WatchHandle } from '../../contracts';
import { createThemeIndexTransformer } from '../index-transform';
import { runModernApplication, runModernDevServer } from '../runner';
import type {
  AngularAdapterDependencies,
  ModernApplicationBuilderOptions,
  ModernDevServerBuilderOptions,
} from '../types';

const [kind, root, restoreTheme, port] = process.argv.slice(2);

function success(generation: number): BuildResult {
  return {
    status: 'success',
    generation,
    snapshot: {
      projectId: 'fixture',
      revision: `revision-${generation}`,
      artifacts: [],
      globalKeywords: [],
      remoteKeywords: [],
      configuration: {
        outputRoot: path.join(root, 'ng-doc', 'fixture'),
        cacheRoot: path.join(root, '.cache', 'ng-doc', 'fixture'),
        assetDirectory: 'assets',
        themes: { light: 'github-light', dark: 'ayu-dark' },
        digest: 'native-smoke',
      },
    },
    manifest: {
      schemaVersion: 1,
      projectId: 'fixture',
      generation,
      revision: `revision-${generation}`,
      files: [],
    },
    diagnostics: [],
    whyRebuilt: [],
  };
}

let observe: ((event: BuildEvent) => void) | undefined;
const session: BuildSession = {
  buildOnce: async () => success(1),
  watch: async (_source, onEvent): Promise<WatchHandle> => {
    observe = onEvent;
    return { initial: Promise.resolve(success(2)), dispose: async () => {} };
  },
  reconcileInputs: async () => {},
  rescan: async () => {},
  dispose: async () => {},
};

const applicationOptions = {
  browser: 'src/main.ts',
  tsConfig: 'tsconfig.app.json',
  outputPath: 'dist',
  index: 'src/index.html',
  aot: true,
  optimization: false,
  sourceMap: false,
  extractLicenses: false,
  progress: false,
  assets: [],
  styles: [],
  scripts: [],
  ngDoc: {},
};

const dependencies: AngularAdapterDependencies = {
  createSession: () => session,
  createEventSource: () => ({ subscribe: async () => ({ dispose: async () => {} }) }),
  createIndexHtmlTransformer: () => createThemeIndexTransformer(pathToFileURL(restoreTheme)),
  buildApplication,
  executeDevServer: executeDevServerBuilder,
};

class Host extends TestingArchitectHost {
  override async getProjectMetadata() {
    return { root: '', sourceRoot: 'src', cli: { cache: { enabled: false } } };
  }
}

const registry = new json.schema.CoreSchemaRegistry();
registry.addPostTransform(json.schema.transforms.addUndefinedDefaults);
const host = new Host(root, root);
const architect = new Architect(host, registry);
host.addBuilder(
  '@ng-doc/builder:modern-application',
  createBuilder((options: json.JsonObject, context: BuilderContext) =>
    runModernApplication(
      options as unknown as ModernApplicationBuilderOptions,
      context,
      dependencies,
    ),
  ),
);
host.addBuilder(
  '@ng-doc/builder:modern-dev-server',
  createBuilder((options: json.JsonObject, context: BuilderContext) =>
    runModernDevServer(options as unknown as ModernDevServerBuilderOptions, context, dependencies),
  ),
);
// The dev server validates its build target's options against Angular's application builder.
host.addBuilder(
  '@angular/build:application',
  createBuilder(async () => ({ success: false })),
);
host.addTarget(
  { project: 'fixture', target: 'build' },
  '@ng-doc/builder:modern-application',
  applicationOptions,
);
host.addTarget({ project: 'fixture', target: 'serve' }, '@ng-doc/builder:modern-dev-server', {
  buildTarget: 'fixture:build',
  host: '127.0.0.1',
  port: Number(port),
  // The testing host applies no schema defaults: Angular's `watch: true` default is explicit here.
  watch: true,
  liveReload: false,
  hmr: false,
  prebundle: false,
});

const run = await architect.scheduleTarget({
  project: 'fixture',
  target: kind === 'application' ? 'build' : 'serve',
});
run.output.subscribe((output) => process.stdout.write(`NGDOC_SMOKE ${JSON.stringify(output)}\n`));
const commands = createInterface({ input: process.stdin });
commands.on('line', (line) => {
  if (line === 'fatal') {
    observe?.({
      kind: 'diagnostic',
      diagnostic: { code: 'WATCHER_ERROR', severity: 'error', stage: 'host', message: 'smoke' },
    });
  }
  if (line === 'stop') void run.stop();
});
await run.lastOutput.catch(() => undefined);
await run.stop();
commands.close();
process.stdout.write('NGDOC_SMOKE_DONE\n');
