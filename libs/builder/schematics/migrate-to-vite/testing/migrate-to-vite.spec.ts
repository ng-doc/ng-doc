import { normalize, virtualFs } from '@angular-devkit/core';
import { NodeJsSyncHost } from '@angular-devkit/core/node';
import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { KNOWN_BUILD_OPTIONS } from '../analyze';
import { ngDocViteDependencies } from '../setup/dependencies';
import {
  customOptionsApp,
  Files,
  ngModuleApp,
  nxApp,
  snapshot,
  standaloneApp,
  treeOf,
} from './fixtures';

const collectionPath: string = join(__dirname, '../../collection.json');
const runner = new SchematicTestRunner('schematics', collectionPath);
const workspace = (tree: UnitTestTree) => JSON.parse(tree.readText('angular.json'));

async function migrate(files: Files | UnitTestTree, options: object = {}): Promise<UnitTestTree> {
  const tree = files instanceof UnitTestTree ? files : treeOf(files);
  return runner.runSchematic('migrate-to-vite', { skipInstall: true, ...options }, tree);
}

/** The option names of the object passed to `createNgDocApplicationPlugin` in a configuration. */
function applicationPluginKeys(config: string): string[] {
  const source = ts.createSourceFile('vite.config.mjs', config, ts.ScriptTarget.Latest, true);
  let keys: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'createNgDocApplicationPlugin' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      keys = node.arguments[0].properties.map((property) => property.name!.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys.sort();
}

/** The keys of an object constant of the Vite application plugin's source. */
function pluginTable(name: string): string[] {
  const text = readFileSync(join(__dirname, '../../../generator/vite/application.ts'), 'utf8');
  const match = new RegExp(
    `const ${name}[^=]*=\\s*(?:new Set\\()?([\\[{][\\s\\S]*?[\\]}])\\)?;`,
  ).exec(text);
  if (!match) throw new Error(`${name} not found in vite/application.ts`);
  return [...match[1].matchAll(/^\s*'?([A-Za-z]+)'?[:,]/gm)].map((item) => item[1]).sort();
}

describe('migrate-to-vite', () => {
  it('migrates a standalone Angular 22 SSR application', async () => {
    const tree = await migrate(standaloneApp());
    const targets = workspace(tree).projects.site.architect;

    expect(targets.build).toEqual({
      builder: '@ng-doc/builder:vite-application',
      options: { configFile: 'vite.config.mjs', outputPath: 'dist/site' },
      configurations: { production: { mode: 'production' }, development: { mode: 'development' } },
      defaultConfiguration: 'production',
    });
    expect(targets.serve).toEqual({
      builder: '@ng-doc/builder:vite-dev-server',
      options: { configFile: 'vite.config.mjs' },
      configurations: { production: { mode: 'production' }, development: { mode: 'development' } },
      defaultConfiguration: 'development',
    });
    expect(targets['build-legacy'].builder).toBe('@ng-doc/builder:application');
    expect(targets['serve-legacy'].configurations.production.buildTarget).toBe(
      'site:build-legacy:production',
    );
    expect(targets.test.options.buildTarget).toBe('site:build-legacy:development');
    expect(Object.keys(targets)).toEqual([
      'build',
      'build-legacy',
      'serve',
      'serve-legacy',
      'test',
    ]);

    const config = tree.readText('vite.config.mjs');
    expect(config).toContain(
      "const workspaceRoot = fileURLToPath(new URL('./', import.meta.url));",
    );
    expect(config).toContain("root: workspace('src'),");
    expect(config).toContain("browser: 'src/main.ts',");
    expect(config).toContain("server: 'src/main.server.ts',");
    expect(config).toContain(
      "styles: ['node_modules/@ng-doc/app/styles/global.css', 'src/styles.scss'],",
    );
    expect(config).toContain("inlineStylesExtension: 'scss',");
    expect(config).toContain("angularComponentProbe: workspace('src/app/app.ts'),");
    expect(config).toContain("configFile: workspace('ng-doc.config.ts'),");
    expect(config).toContain("outputRoot: workspace('ng-doc/site'),");
    expect(config).toContain("cacheRoot: workspace('.cache/ng-doc/site'),");
    expect(config).toContain("outDir: workspace('dist/site/browser'),");
    // The development configuration's source maps make `sourcemap` a per-mode setting.
    expect(config).toContain('development: { sourcemap: true }');
    expect(config).toContain('sourcemap: settings.sourcemap,');
    // The legacy generated-assets entry is gone: the Vite plugin serves those assets itself.
    expect(config).not.toContain('ng-doc/site/assets');
    expect(applicationPluginKeys(config)).toEqual([
      'assets',
      'browser',
      'server',
      'sourceRoot',
      'styles',
      'workspaceRoot',
    ]);

    expect(tree.readText('src/main.server.ts')).toContain(
      "import { withNgDocContentReady } from '@ng-doc/app/helpers';",
    );
    expect(tree.readText('src/main.server.ts')).toContain(
      'export default withNgDocContentReady(bootstrap);',
    );
    expect(tree.readText('.gitignore')).toContain('\n/.cache/ng-doc\n');
    const packageJson = JSON.parse(tree.readText('package.json'));
    expect(packageJson.devDependencies).toMatchObject({
      vite: ngDocViteDependencies()['vite'],
      '@analogjs/vite-plugin-angular': ngDocViteDependencies()['@analogjs/vite-plugin-angular'],
    });
    expect(tree.exists('ng-doc/site/index.ts')).toBe(false);
    expect(tree.exists('ng-doc/site/guides/intro/page.ts')).toBe(false);

    const report = tree.readText('.ng-doc-migration/site/report.md');
    expect(report).toContain(
      '`build.outputMode`: The Angular server that renders on request is not built.',
    );
    expect(report).toContain('`build.ssr.entry`: `src/server.ts` is not built.');
    expect(report).toContain('`build.budgets`: Vite has no size budgets.');
    expect(report).toContain(
      '`@angular/compiler` is `^22.0.0`; the Vite engine is tested with `22.0.6`.',
    );
    expect(report).toContain('`test.buildTarget`: now `site:build-legacy:development`');
    expect(report).not.toContain('## Blocking');
    expect(tree.readText('.ng-doc-migration/site/backup/src/main.server.ts.bak')).toBe(
      standaloneApp()['src/main.server.ts'],
    );
  });

  it('migrates an NgModule application in a multi-project layout', async () => {
    const tree = await migrate(ngModuleApp());
    const targets = workspace(tree).projects.docs.architect;
    expect(targets.build.options).toEqual({
      configFile: 'projects/docs/vite.config.mjs',
      outputPath: 'dist/docs',
    });
    expect(targets.build.configurations).toBeUndefined();
    expect(targets.serve.options).toEqual({
      configFile: 'projects/docs/vite.config.mjs',
      port: 4300,
    });
    expect(targets['serve-legacy'].options.buildTarget).toBe('docs:build-legacy');

    const config = tree.readText('projects/docs/vite.config.mjs');
    expect(config).toContain("fileURLToPath(new URL('../../', import.meta.url))");
    expect(config).toContain(
      "angularComponentProbe: workspace('projects/docs/src/app/app.component.ts')",
    );
    expect(config).toContain("polyfills: ['zone.js'],");
    expect(config).toContain("configFile: workspace('projects/docs/src/ng-doc.config.ts'),");
    expect(config).toContain("docsRoot: workspace('projects/docs/src'),");
    expect(config).toContain("tsconfig: workspace('projects/docs/tsconfig.app.json'),");
    expect(config).not.toContain('settings.');
    expect(config).not.toContain('server:');
    expect(tree.exists('.gitignore')).toBe(false);
    const report = tree.readText('.ng-doc-migration/docs/report.md');
    expect(report).toContain('`.gitignore`: does not exist');
    expect(report).toContain('`build.scripts`: The list is empty.');
  });

  it('migrates custom options and reports what it cannot migrate', async () => {
    const tree = await migrate(customOptionsApp());
    const targets = workspace(tree).projects.site.architect;
    expect(targets.build.options).toEqual({
      configFile: 'vite.config.mjs',
      outputPath: 'dist/site',
      routes: ['/', '/guides/one', '/guides/two'],
      discoverRoutes: false,
    });
    expect(targets.serve.options).toEqual({
      configFile: 'vite.config.mjs',
      host: '0.0.0.0',
      port: 4400,
    });
    expect(targets['extract-i18n'].options).toEqual({ buildTarget: 'site:build-legacy' });

    const config = tree.readText('vite.config.mjs');
    expect(config).toContain("base: '/docs/',");
    expect(config).toContain("configFile: workspace('docs/ng-doc.config.ts'),");
    expect(config).toContain("discovery: { tags: ['public'] },");
    expect(config).toContain("loadPaths: [workspace('src/styles')]");
    expect(config).toContain("rollupOptions: { external: ['canvas'] },");
    expect(config).toContain("headers: { 'X-Docs': 'yes' }");
    // Per-mode settings: the production configuration's tsconfig, replacements, source maps, define.
    expect(config).toContain('const settings = modes[mode] ?? fallback;');
    expect(config).toContain("tsconfig: 'tsconfig.prod.json'");
    expect(config).toContain("sourcemap: 'hidden'");
    expect(config).toContain('define: { BUILD_KIND: "\'production\'" }');
    expect(config).toContain("with: 'src/environments/environment.prod.ts'");
    expect(config).toContain('tsconfig: workspace(settings.tsconfig),');
    expect(config).toContain('fileReplacements: settings.fileReplacements,');
    expect(applicationPluginKeys(config)).toEqual([
      'assets',
      'browser',
      'server',
      'sourceRoot',
      'styles',
      'workspaceRoot',
    ]);
    // The legacy output of a literal `outDir` is deleted.
    expect(tree.exists('generated/ng-doc/site/index.ts')).toBe(false);

    const report = tree.readText('.ng-doc-migration/site/report.md');
    for (const expected of [
      '`build.deployUrl`: Vite `base` serves the whole application from one URL',
      '`build.scripts`: Import the scripts from the browser entry',
      '`build.webWorkerTsConfig`:',
      '`build.outputPath.browser`: is ``; the Vite engine always writes `browser/`.',
      '`build.unknownOption`: is not a known option',
      '`build.stylePreprocessorOptions.sass`: Set it in Vite `css.preprocessorOptions`.',
      '`serve.proxyConfig`: `proxy.conf.json`: move the proxy rules to Vite `server.proxy`.',
      '`serve.hmr`: is `false`',
      '`build.prerender.routesFile`: its 3 route(s) became `routes`',
      '`build.allowedCommonJsDependencies`: Vite has no CommonJS warning to silence.',
      '`extract-i18n.buildTarget`: now `site:build-legacy`',
    ]) {
      expect(report).toContain(expected);
    }
  });

  it('migrates an Nx project.json with executors and keeps target-level settings', async () => {
    const tree = await migrate(nxApp());
    const project = JSON.parse(tree.readText('apps/docs/project.json'));
    expect(project.targets.build).toEqual({
      executor: '@ng-doc/builder:vite-application',
      outputs: ['{options.outputPath}'],
      options: { configFile: 'apps/docs/vite.config.mjs', outputPath: 'dist/apps/docs' },
      configurations: { production: { mode: 'production' }, development: { mode: 'development' } },
      defaultConfiguration: 'production',
    });
    expect(project.targets.serve.continuous).toBe(true);
    expect(project.targets.serve.executor).toBe('@ng-doc/builder:vite-dev-server');
    expect(project.targets['build-legacy'].executor).toBe('@ng-doc/builder:application');
    expect(project.targets['serve-legacy'].configurations.development.buildTarget).toBe(
      'docs:build-legacy:development',
    );
    expect(project.targets.lint).toEqual({ executor: '@nx/eslint:lint' });
    const config = tree.readText('apps/docs/vite.config.mjs');
    expect(config).toContain("'apps/docs/src/assets',");
    expect(config).toContain('fileReplacements: settings.fileReplacements,');
    expect(tree.exists('angular.json')).toBe(false);
    // vite was already installed at the exact version, so it is neither added nor reported.
    const packageJson = JSON.parse(tree.readText('package.json'));
    expect(packageJson.devDependencies.vite).toBe('7.3.5');
    expect(tree.readText('.ng-doc-migration/docs/report.md')).not.toContain('`vite` is');
  });

  it('refuses a localized application and changes nothing', async () => {
    const files = standaloneApp();
    const angular = JSON.parse(files['angular.json']);
    angular.projects.site.architect.build.options.localize = true;
    files['angular.json'] = JSON.stringify(angular);
    const tree = treeOf(files);
    const before = snapshot(tree);
    await expect(migrate(tree)).rejects.toThrow('[NGDOC_MIGRATE_BLOCKED]');
    expect(snapshot(tree)).toEqual(before);
  });

  it('refuses a custom builder and changes nothing', async () => {
    const files = standaloneApp();
    const angular = JSON.parse(files['angular.json']);
    angular.projects.site.architect.build.builder = '@angular-builders/custom-esbuild:application';
    files['angular.json'] = JSON.stringify(angular);
    const tree = treeOf(files);
    const before = snapshot(tree);
    await expect(migrate(tree, { project: 'site' })).rejects.toThrow('[NGDOC_MIGRATE_BLOCKED]');
    expect(snapshot(tree)).toEqual(before);
  });

  it('refuses a server entry that exports an NgModule and changes nothing', async () => {
    const files = standaloneApp();
    files['src/main.server.ts'] =
      "export { AppServerModule as default } from './app/app.module.server';\n";
    files['src/app/app.module.server.ts'] =
      "import { NgModule } from '@angular/core';\n\n@NgModule({})\nexport class AppServerModule {}\n";
    const tree = treeOf(files);
    const before = snapshot(tree);
    const logs: string[] = [];
    const subscription = runner.logger.subscribe((entry) => logs.push(entry.message));
    try {
      await expect(migrate(tree)).rejects.toThrow('[NGDOC_MIGRATE_BLOCKED]');
    } finally {
      subscription.unsubscribe();
    }
    expect(snapshot(tree)).toEqual(before);
    expect(logs.join('\n')).toMatch(
      /`build\.server`: \[NGDOC_MIGRATE_SERVER_NGMODULE\] `src\/main\.server\.ts` exports the NgModule `AppServerModule`/,
    );
    // A bootstrap function, as the standalone fixture exports it, is migrated.
    expect(snapshot(await migrate(standaloneApp()))['vite.config.mjs']).toContain(
      "server: 'src/main.server.ts'",
    );
  });

  it('refuses when the root component cannot be found, and accepts --root-component', async () => {
    const files = standaloneApp();
    files['src/main.ts'] = "import { start } from './start';\n\nstart();\n";
    await expect(migrate(files)).rejects.toThrow('[NGDOC_MIGRATE_BLOCKED]');
    const tree = await migrate(files, { rootComponent: 'src/app/app.ts' });
    expect(tree.readText('vite.config.mjs')).toContain(
      "angularComponentProbe: workspace('src/app/app.ts')",
    );
  });

  it('refuses to overwrite an existing Vite configuration', async () => {
    const files = { ...standaloneApp(), 'vite.config.mjs': 'export default {};\n' };
    await expect(migrate(files)).rejects.toThrow('[NGDOC_MIGRATE_BLOCKED]');
    const tree = await migrate(files, { viteConfig: 'vite.ngdoc.mjs' });
    expect(tree.readText('vite.config.mjs')).toBe('export default {};\n');
    expect(workspace(tree).projects.site.architect.build.options.configFile).toBe('vite.ngdoc.mjs');
  });

  it('is idempotent: a second run leaves the tree unchanged', async () => {
    for (const fixture of [standaloneApp, ngModuleApp, customOptionsApp, nxApp]) {
      const once = await migrate(fixture());
      const first = snapshot(once);
      const twice = await migrate(once);
      expect(snapshot(twice)).toEqual(first);
    }
  });

  it('keeps edits to the generated files on a second run', async () => {
    const once = await migrate(standaloneApp());
    once.overwrite('vite.config.mjs', `${once.readText('vite.config.mjs')}// edited\n`);
    const twice = await migrate(once);
    expect(twice.readText('vite.config.mjs')).toContain('// edited');
    expect(twice.readText('.ng-doc-migration/site/report.md')).toContain(
      '`vite.config.mjs`: was edited after the migration and was kept as it is.',
    );
  });

  it('does nothing for a project already on the Vite engine without migration state', async () => {
    const once = await migrate(standaloneApp());
    once.delete('.ng-doc-migration/site/state.json');
    const angular = workspace(once);
    delete angular.projects.site.architect['build-legacy'];
    delete angular.projects.site.architect['serve-legacy'];
    once.overwrite('angular.json', JSON.stringify(angular, null, 2));
    const before = snapshot(once);
    const twice = await migrate(once, { project: 'site' });
    expect(snapshot(twice)).toEqual(before);
  });

  it('reverts a migration to the original workspace', async () => {
    for (const fixture of [standaloneApp, ngModuleApp, customOptionsApp, nxApp]) {
      const original = treeOf(fixture());
      const expected = snapshot(original);
      const migrated = await migrate(original);
      const reverted = await migrate(migrated, { revert: true });
      const after = snapshot(reverted);
      // The legacy generated folder is output: the legacy builders write it again.
      const withoutOutput = (files: Files) =>
        Object.fromEntries(
          Object.entries(files).filter(([file]) => !/(^|\/)ng-doc\/[^/]+\//.test(file)),
        );
      // Dependencies stay; the rest of package.json is the original.
      const withoutPackage = (files: Files) =>
        Object.fromEntries(Object.entries(files).filter(([file]) => file !== 'package.json'));
      expect(withoutPackage(withoutOutput(after))).toEqual(withoutPackage(withoutOutput(expected)));
      // Reformatting is not allowed: the targets come back byte for byte, apart from JSON layout.
      for (const file of Object.keys(expected).filter((name) => name.endsWith('.json'))) {
        if (file === 'package.json') continue;
        expect(JSON.parse(after[file])).toEqual(JSON.parse(expected[file]));
      }
    }
  });

  it('reverts files that were only reformatted, and deletes the engine output and cache', async () => {
    const migrated = await migrate(standaloneApp());
    // As the Angular CLI does after a schematic: Prettier reformats the files it wrote.
    migrated.overwrite(
      'src/main.server.ts',
      migrated
        .readText('src/main.server.ts')
        .replace('=>\n    bootstrapApplication', '=> bootstrapApplication'),
    );
    migrated.create('.cache/ng-doc/site/cache.json', '{}');
    migrated.create('ng-doc/site/index.ts', 'export {};');
    const reverted = await migrate(migrated, { revert: true });
    expect(reverted.readText('src/main.server.ts')).toBe(standaloneApp()['src/main.server.ts']);
    expect(reverted.exists('.cache/ng-doc/site/cache.json')).toBe(false);
    expect(reverted.exists('ng-doc/site/index.ts')).toBe(false);
    expect(reverted.exists('.ng-doc-migration/site/backup/src/main.server.ts.bak')).toBe(false);
  });

  it('keeps files edited after the migration when it reverts', async () => {
    const migrated = await migrate(standaloneApp());
    migrated.overwrite('vite.config.mjs', 'export default {};\n');
    const reverted = await migrate(migrated, { revert: true });
    expect(reverted.readText('vite.config.mjs')).toBe('export default {};\n');
    expect(workspace(reverted).projects.site.architect.build.builder).toBe(
      '@ng-doc/builder:application',
    );
  });

  it('refuses to revert, and changes nothing, when an original target was deleted', async () => {
    const migrated = await migrate(standaloneApp());
    const angular = workspace(migrated);
    delete angular.projects.site.architect['build-legacy'];
    migrated.overwrite('angular.json', JSON.stringify(angular, null, 2));
    const before = snapshot(migrated);
    await expect(migrate(migrated, { revert: true })).rejects.toThrow(
      '[NGDOC_MIGRATE_REVERT_TARGET]',
    );
    expect(snapshot(migrated)).toEqual(before);
  });

  it('reports a Vite target edited after the migration when it reverts', async () => {
    const migrated = await migrate(standaloneApp());
    const angular = workspace(migrated);
    angular.projects.site.architect.build.options.routes = ['/extra'];
    migrated.overwrite('angular.json', JSON.stringify(angular, null, 2));
    const messages: string[] = [];
    const subscription = runner.logger.subscribe((entry) => messages.push(entry.message));
    try {
      await migrate(migrated, { revert: true });
    } finally {
      subscription.unsubscribe();
    }
    expect(messages.join('\n')).toContain(
      'Target `build` was edited after the migration; the original was restored and the edits are gone.',
    );
    expect(messages.join('\n')).not.toContain('Target `serve` was edited');
  });

  it('changes nothing when a migrated project lost its migration state', async () => {
    const once = await migrate(standaloneApp());
    for (const file of Object.keys(snapshot(once)).filter((name) =>
      name.startsWith('.ng-doc-migration/'),
    )) {
      once.delete(file);
    }
    const before = snapshot(once);
    const twice = await migrate(once);
    expect(snapshot(twice)).toEqual(before);
    expect(Object.keys(workspace(twice).projects.site.architect)).not.toContain(
      'build-legacy-legacy',
    );
    // Also when the Vite targets were replaced by hand but the configuration file is still there.
    const angular = workspace(once);
    angular.projects.site.architect.build.builder = '@nx/vite:build';
    once.overwrite('angular.json', JSON.stringify(angular, null, 2));
    const edited = snapshot(once);
    expect(snapshot(await migrate(once))).toEqual(edited);
  });

  it('fails with a coded error on a corrupted migration state', async () => {
    const once = await migrate(standaloneApp());
    once.overwrite('.ng-doc-migration/site/state.json', '{ "schemaVersion": 1, ');
    await expect(migrate(once)).rejects.toThrow('[NGDOC_MIGRATE_STATE]');
    await expect(migrate(once, { revert: true })).rejects.toThrow('is not valid JSON');
  });

  it('keeps the plain options of a build target without a default configuration', async () => {
    const files = standaloneApp();
    const angular = JSON.parse(files['angular.json']);
    const targets = angular.projects.site.architect;
    delete targets.build.defaultConfiguration;
    targets.build.options.fileReplacements = [{ replace: 'src/env.ts', with: 'src/env.plain.ts' }];
    targets.build.configurations.production.fileReplacements = [
      { replace: 'src/env.ts', with: 'src/env.prod.ts' },
    ];
    targets.serve.options = { buildTarget: 'site:build' };
    files['angular.json'] = JSON.stringify(angular);
    const tree = await migrate(files);
    const migrated = workspace(tree).projects.site.architect;
    expect(migrated.build.options.mode).toBe('default');
    expect(migrated.build.defaultConfiguration).toBeUndefined();
    expect(migrated.serve.options.mode).toBe('default');
    const config = tree.readText('vite.config.mjs');
    expect(config).not.toMatch(/\bdefault: \{/);
    expect(config).toMatch(
      /const fallback = \{\s*fileReplacements: \[\{ replace: 'src\/env.ts', with: 'src\/env.plain.ts' \}\]/,
    );
    // `default` is no configuration's name, so that mode reads the fallback.
    expect(config).toContain('const settings = modes[mode] ?? fallback;');
  });

  it('migrates prerender: false, also per configuration', async () => {
    const files = standaloneApp();
    const angular = JSON.parse(files['angular.json']);
    const build = angular.projects.site.architect.build;
    delete build.options.outputMode;
    delete build.options.ssr;
    build.configurations.development.prerender = false;
    files['angular.json'] = JSON.stringify(angular);
    let tree = await migrate(files);
    let migrated = workspace(tree).projects.site.architect.build;
    expect(migrated.options.prerender).toBeUndefined();
    expect(migrated.configurations.development).toEqual({
      mode: 'development',
      prerender: false,
      ssr: false,
    });

    build.options.prerender = false;
    delete build.configurations.development.prerender;
    files['angular.json'] = JSON.stringify(angular);
    tree = await migrate(files);
    migrated = workspace(tree).projects.site.architect.build;
    expect(migrated.options).toMatchObject({ prerender: false, ssr: false });
    expect(migrated.configurations.production).toEqual({ mode: 'production' });
  });

  it("migrates the Nx adapter's angular.json view and keeps Nx tokens in the targets", async () => {
    const files = nxApp();
    const project = JSON.parse(files['apps/docs/project.json']);
    delete files['apps/docs/project.json'];
    // As Nx presents project.json to Angular devkit schematics: `architect` and `builder`.
    const architect = Object.fromEntries(
      Object.entries(project.targets as Record<string, Record<string, unknown>>).map(
        ([name, { executor, ...rest }]) => [name, { builder: executor, ...rest }],
      ),
    );
    const build = architect['build'] as { options: Record<string, unknown>; dependsOn?: unknown };
    build.options['outputPath'] = '{workspaceRoot}/dist/{projectName}';
    build.options['tsConfig'] = '{projectRoot}/tsconfig.app.json';
    build.dependsOn = ['^build'];
    files['angular.json'] = JSON.stringify({
      version: 1,
      projects: { docs: { root: 'apps/docs', sourceRoot: 'apps/docs/src', architect } },
    });
    const tree = await migrate(files);
    const targets = workspace(tree).projects.docs.architect;
    expect(targets.build.builder).toBe('@ng-doc/builder:vite-application');
    expect(targets.build.options.outputPath).toBe('{workspaceRoot}/dist/{projectName}');
    expect(targets.build.outputs).toEqual(['{options.outputPath}']);
    expect(targets.build.dependsOn).toEqual(['^build']);
    expect(targets['build-legacy'].options.tsConfig).toBe('{projectRoot}/tsconfig.app.json');
    expect(targets.serve.continuous).toBe(true);
    const config = tree.readText('apps/docs/vite.config.mjs');
    expect(config).toContain("outDir: workspace('dist/docs/browser'),");
    expect(config).toContain("tsconfig: workspace('apps/docs/tsconfig.app.json'),");
    for (const token of ['{workspaceRoot}', '{projectRoot}', '{projectName}']) {
      expect(config).not.toContain(token);
    }
  });

  it('fails to revert a project that was not migrated', async () => {
    await expect(migrate(standaloneApp(), { revert: true })).rejects.toThrow(
      '[NGDOC_MIGRATE_REVERT]',
    );
  });

  it('writes nothing outside the tree, so --dry-run changes no file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ngdoc-migrate-'));
    try {
      const files = standaloneApp();
      for (const [file, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), content);
      }
      const host = new virtualFs.ScopedHost(new NodeJsSyncHost(), normalize(root));
      const tree = new UnitTestTree(new HostTree(host));
      const migrated = await migrate(tree);
      expect(migrated.exists('vite.config.mjs')).toBe(true);
      for (const [file, content] of Object.entries(files)) {
        expect(readFileSync(join(root, file), 'utf8')).toBe(content);
      }
      expect(() => readFileSync(join(root, 'vite.config.mjs'))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('adds an ng update note that changes nothing and names the schematic', async () => {
    const migrations = new SchematicTestRunner(
      'migrations',
      join(__dirname, '../../migration.json'),
    );
    const messages: string[] = [];
    migrations.logger.subscribe((entry) => messages.push(entry.message));
    const tree = treeOf(standaloneApp());
    const before = snapshot(tree);
    const after = await migrations.runSchematic('vite-engine-note-v22', {}, tree);
    expect(snapshot(after)).toEqual(before);
    expect(messages.join('\n')).toContain(
      'ng g @ng-doc/builder:migrate-to-vite --project site --dry-run',
    );
  });

  it('never passes the application plugin an option it rejects, and knows every option it names', () => {
    const accepted = pluginTable('OPTIONS');
    expect(accepted).toEqual(
      ['assets', 'browser', 'polyfills', 'server', 'sourceRoot', 'styles', 'workspaceRoot'].sort(),
    );
    for (const option of [...pluginTable('MOVED_OPTIONS'), ...pluginTable('IGNORED_OPTIONS')]) {
      expect(KNOWN_BUILD_OPTIONS).toContain(option);
    }
  });
});
