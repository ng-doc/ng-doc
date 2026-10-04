import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { nxApp, snapshot, standaloneApp, treeOf } from '../../migrate-to-vite/testing/fixtures';

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
