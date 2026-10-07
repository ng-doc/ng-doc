import { logging } from '@angular-devkit/core';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';

import { analyzeProject } from '../../migrate-to-vite/analyze';
import { readWorkspaceProjects } from '../../migrate-to-vite/setup/workspace';
import {
  Files,
  hostTreeOf,
  nxApp,
  snapshot,
  standaloneApp,
  treeOf,
  withNxAngularJson,
} from '../../migrate-to-vite/testing/fixtures';

const runner = new SchematicTestRunner('schematics', join(__dirname, '../../collection.json'));

/** The Nx application of the migrate-to-vite specs, before NgDoc: Angular's own executors. */
function nxAngularApp(): UnitTestTree {
  const files = nxApp();
  const project = JSON.parse(files['apps/docs/project.json']);
  project.targets.build.executor = '@angular/build:application';
  project.targets.serve.executor = '@angular/build:dev-server';
  project.targets.test = { executor: '@angular/build:unit-test', options: {} };
  files['apps/docs/project.json'] = `${JSON.stringify(project, null, 2)}\n`;
  files['.gitignore'] = '/node_modules\n';
  return treeOf(files);
}

/** The Nx application on Nx's own executors, which run Angular's builders. */
function nxExecutorFiles(): Files {
  const files = nxApp();
  const project = JSON.parse(files['apps/docs/project.json']);
  project.targets.build.executor = '@nx/angular:application';
  project.targets.serve.executor = '@nx/angular:dev-server';
  project.targets.test = { executor: '@angular/build:unit-test', options: {} };
  files['apps/docs/project.json'] = `${JSON.stringify(project, null, 2)}\n`;
  files['.gitignore'] = '/node_modules\n';
  return files;
}

/**
 * The options of an installed Nx executor that Angular's builder doesn't have.
 * @param nx - The schema of the Nx executor, relative to `@nx/angular`.
 * @param angular - The schema of Angular's builder, relative to `@angular/build`.
 */
function nxOnlyOptions(nx: string, angular: string): string[] {
  const schema = (pkg: string, file: string) =>
    JSON.parse(readFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), file), 'utf8'))
      .properties as Record<string, unknown>;
  const own = schema('@angular/build', angular);
  return Object.keys(schema('@nx/angular', nx)).filter((option) => !(option in own));
}

/**
 * Runs `vite-setup` and returns the tree and what it logged.
 * @param tree - The workspace.
 */
async function setupWithLogs(tree: UnitTestTree): Promise<{ tree: UnitTestTree; logs: string }> {
  const logs: string[] = [];
  const subscription = runner.logger.subscribe((entry: logging.LogEntry) =>
    logs.push(`${entry.level}: ${entry.message}`),
  );
  try {
    const result = await runner.runSchematic(
      'vite-setup',
      { project: 'docs', skipInstall: true },
      tree,
    );
    return { tree: result, logs: logs.join('\n') };
  } finally {
    subscription.unsubscribe();
  }
}

describe('vite-setup', () => {
  it('should write Nx targets with the executor key and keep the Angular build options', async () => {
    const tree = await runner.runSchematic('vite-setup', { project: 'docs' }, nxAngularApp());
    const targets = JSON.parse(tree.readText('apps/docs/project.json')).targets;

    expect(targets.build.executor).toBe('@ng-doc/builder:vite-application');
    expect(targets.build.builder).toBeUndefined();
    expect(targets.build.outputs).toEqual(['{options.outputPath}']);
    expect(targets.build.options).toEqual({
      configFile: 'apps/docs/vite.config.mjs',
      outputPath: 'dist/apps/docs',
    });
    expect(targets.serve.executor).toBe('@ng-doc/builder:vite-dev-server');
    expect(targets.serve.continuous).toBe(true);
    expect(targets['build-angular'].executor).toBe('@angular/build:application');
    expect(targets.test.options.buildTarget).toBe('docs:build-angular:development');
    expect(tree.readText('apps/docs/vite.config.mjs')).toContain("inlineStylesExtension: 'scss'");
    expect(tree.readText('.gitignore')).toContain('/.cache/ng-doc');
    // `vite` is already a dependency; the Analog plugin is added and installed.
    expect(runner.tasks.map((task) => task.name)).toEqual(['node-package']);
  });

  it('should change nothing on a project that already builds with the Vite engine', async () => {
    const first = await runner.runSchematic(
      'vite-setup',
      { project: 'docs', skipInstall: true },
      nxAngularApp(),
    );
    const second = await runner.runSchematic(
      'vite-setup',
      { project: 'docs', skipInstall: true },
      first,
    );

    expect(snapshot(second)).toEqual(snapshot(first));
  });

  it('should refuse a project that already has a build-angular target', async () => {
    const tree = nxAngularApp();
    const project = JSON.parse(tree.readText('apps/docs/project.json'));
    project.targets['build-angular'] = { executor: 'nx:run-commands' };
    tree.overwrite('apps/docs/project.json', JSON.stringify(project, null, 2));

    await expect(runner.runSchematic('vite-setup', { project: 'docs' }, tree)).rejects.toThrow(
      /NGDOC_VITE_SETUP_BLOCKED[\s\S]*`build-angular`: already exists/,
    );
  });

  it('should set up the Vite engine on an installed Angular 22.0, which it runs on', async () => {
    // The Nx fixture's package.json declares no Angular compiler: the installed one counts.
    const tree = nxAngularApp();
    tree.create(
      'node_modules/@angular/compiler-cli/package.json',
      JSON.stringify({ name: '@angular/compiler-cli', version: '22.0.6' }),
    );

    const result = await runner.runSchematic('vite-setup', { project: 'docs' }, tree);

    const project = JSON.parse(result.readText('apps/docs/project.json'));
    expect(project.targets.build.executor).toBe('@ng-doc/builder:vite-application');
  });

  it('should refuse an unknown project', async () => {
    await expect(
      runner.runSchematic('vite-setup', { project: 'site' }, nxAngularApp()),
    ).rejects.toThrow(/NGDOC_VITE_SETUP_PROJECT/);
  });

  it('should replace a serve target whose options name the build target', async () => {
    const tree = nxAngularApp();
    const project = JSON.parse(tree.readText('apps/docs/project.json'));
    project.targets.serve.options = { buildTarget: 'docs:build:development', port: 4300 };
    tree.overwrite('apps/docs/project.json', JSON.stringify(project, null, 2));

    const result = await runner.runSchematic(
      'vite-setup',
      { project: 'docs', skipInstall: true },
      tree,
    );
    const serve = JSON.parse(result.readText('apps/docs/project.json')).targets.serve;

    expect(serve.executor).toBe('@ng-doc/builder:vite-dev-server');
    expect(serve.options).toEqual({
      configFile: 'apps/docs/vite.config.mjs',
      mode: 'development',
      port: 4300,
    });
  });

  it("should set up a project on Nx's application and dev-server executors", async () => {
    const files = nxExecutorFiles();
    const project = JSON.parse(files['apps/docs/project.json']);
    Object.assign(project.targets.build.options, {
      buildLibsFromSource: true,
      plugins: [{ path: 'tools/esbuild/env.js', options: { prefix: 'APP_' } }],
      indexHtmlTransformer: 'tools/index-html.ts',
    });
    project.targets.serve.options = {
      disableHostCheck: true,
      esbuildMiddleware: ['tools/middleware.js'],
      watchDependencies: true,
    };
    files['apps/docs/project.json'] = JSON.stringify(project, null, 2);

    const { tree, logs } = await setupWithLogs(treeOf(files));
    const targets = JSON.parse(tree.readText('apps/docs/project.json')).targets;

    expect(targets.build.executor).toBe('@ng-doc/builder:vite-application');
    expect(targets.serve.executor).toBe('@ng-doc/builder:vite-dev-server');
    expect(targets.serve.configurations.development).toEqual({ mode: 'development' });
    // The Nx executor keeps its options for the builders that read them.
    expect(targets['build-angular'].executor).toBe('@nx/angular:application');
    expect(targets['build-angular'].options.plugins).toEqual(project.targets.build.options.plugins);
    expect(targets.test.options.buildTarget).toBe('docs:build-angular:development');
    expect(tree.readText('apps/docs/vite.config.mjs')).toContain('allowedHosts: true');
    // What Vite can't do is reported, never dropped silently.
    expect(logs).toMatch(
      /warn: Needs a manual change:[\s\S]*`build\.plugins`: Nx runs these esbuild/,
    );
    expect(logs).toContain('`build.indexHtmlTransformer`: Nx transforms index.html');
    expect(logs).toContain('`serve.esbuildMiddleware`: Add these middleware functions');
    expect(logs).toMatch(
      /Build options the Vite engine does not use: .*`build\.buildLibsFromSource`/,
    );
  });

  it('should report buildLibsFromSource: false of the Nx executors', async () => {
    const files = nxExecutorFiles();
    const project = JSON.parse(files['apps/docs/project.json']);
    project.targets.build.options.buildLibsFromSource = false;
    project.targets.serve.options = { buildLibsFromSource: false };
    files['apps/docs/project.json'] = JSON.stringify(project, null, 2);

    const { logs } = await setupWithLogs(treeOf(files));

    expect(logs).toContain('`build.buildLibsFromSource`: is `false`; the Vite engine reads');
    expect(logs).toContain('`serve.buildLibsFromSource`: is `false`; the Vite engine reads');
  });

  it('should know every option the installed Nx executors add to Angular’s builders', async () => {
    const build = nxOnlyOptions(
      'dist/src/executors/application/schema.json',
      'src/builders/application/schema.json',
    );
    const serve = nxOnlyOptions(
      'dist/src/builders/dev-server/schema.json',
      'src/builders/dev-server/schema.json',
    );
    expect(build).toContain('buildLibsFromSource');
    expect(serve).toContain('esbuildMiddleware');
    const files = nxExecutorFiles();
    const project = JSON.parse(files['apps/docs/project.json']);
    for (const option of build) project.targets.build.options[option] = true;
    project.targets.serve.options = Object.fromEntries(serve.map((option) => [option, true]));
    files['apps/docs/project.json'] = JSON.stringify(project, null, 2);

    const docs = readWorkspaceProjects(treeOf(files)).find((item) => item.name === 'docs')!;
    const { findings } = analyzeProject(treeOf(files), docs, 'build', 'serve', {}, 'executor');
    const subjects = findings.map((finding) => finding.subject);

    for (const option of build) expect(subjects).toContain(`build.${option}`);
    for (const option of serve) expect(subjects).toContain(`serve.${option}`);
    expect(findings.map((finding) => finding.message)).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/not a known option|is not migrated to the Vite development server/),
      ]),
    );
  });

  it('should write through the virtual angular.json of nx g once the tree has changed it', async () => {
    // `ng add` edits the workspace through the devkit API, which `nx g` serves from a virtual
    // angular.json that it writes over every project.json when the tree is committed.
    const files = withNxAngularJson(nxExecutorFiles());
    const tree = hostTreeOf(files);
    const workspace = JSON.parse(tree.readText('angular.json'));
    workspace.projects.docs.architect.build.options.styles.unshift('ng-doc-global.css');
    tree.overwrite('angular.json', JSON.stringify(workspace, null, 2));

    const { tree: result } = await setupWithLogs(tree);
    const architect = JSON.parse(result.readText('angular.json')).projects.docs.architect;

    expect(result.readText('apps/docs/project.json')).toBe(files['apps/docs/project.json']);
    expect(architect.build.builder).toBe('@ng-doc/builder:vite-application');
    expect(architect.serve.builder).toBe('@ng-doc/builder:vite-dev-server');
    expect(architect['build-angular'].builder).toBe('@nx/angular:application');
    expect(architect['build-angular'].options.styles[0]).toBe('ng-doc-global.css');
    expect(result.readText('apps/docs/vite.config.mjs')).toContain("'ng-doc-global.css'");
  });

  it('should keep writing project.json under nx g while the virtual angular.json is unchanged', async () => {
    const files = withNxAngularJson(nxExecutorFiles());

    const { tree } = await setupWithLogs(hostTreeOf(files));

    expect(tree.readText('angular.json')).toBe(files['angular.json']);
    expect(JSON.parse(tree.readText('apps/docs/project.json')).targets.build.executor).toBe(
      '@ng-doc/builder:vite-application',
    );
  });

  it('should read angular.json with comments and trailing commas, and keep its layout', async () => {
    const files = standaloneApp();
    const angular = JSON.parse(files['angular.json']);
    const architect = angular.projects.site.architect;
    architect.build.builder = '@angular/build:application';
    architect.serve.builder = '@angular/build:dev-server';
    for (const key of Object.keys(architect)) {
      if (!['build', 'serve'].includes(key)) delete architect[key];
    }
    // Tabs, a comment and trailing commas, which the Angular CLI accepts.
    files['angular.json'] = JSON.stringify(angular, null, '\t')
      .replace('{', '{\n\t// The workspace of the docs site.')
      .replace(/\n\t}\n}$/, '\n\t},\n}\n');
    expect(files['angular.json']).toMatch(/\t\/\/ The workspace[\s\S]*},\n}\n$/);
    const tree = await runner.runSchematic(
      'vite-setup',
      { project: 'site', skipInstall: true },
      treeOf(files),
    );
    const text = tree.readText('angular.json');

    expect(text).toContain('// The workspace of the docs site.');
    expect(text).toMatch(/\n\t\t\t\t\t"builder": "@ng-doc\/builder:vite-application"/);
    expect(text).not.toMatch(/^ +"/m);
    expect(text).toContain('"build-angular"');
  });
});
