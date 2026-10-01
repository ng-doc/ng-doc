import { Rule, SchematicContext, SchematicsException, Tree } from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';

import { analyzeProject, MigrationFinding } from '../migrate-to-vite/analyze';
import { addGitIgnoreLine, addNgDocViteDependencies } from '../migrate-to-vite/setup/dependencies';
import { wrapServerEntry } from '../migrate-to-vite/setup/source';
import {
  VITE_APPLICATION_BUILDER,
  VITE_DEV_SERVER_BUILDER,
} from '../migrate-to-vite/setup/targets';
import { renderNgDocViteConfig } from '../migrate-to-vite/setup/vite-config';
import {
  builderKey,
  readWorkspaceProjects,
  targetBuilder,
  withBuildTarget,
  WorkspaceProject,
  WorkspaceTarget,
  writeTarget,
} from '../migrate-to-vite/setup/workspace';
import { NgDocViteSetupSchema } from './schema';

/** The Angular CLI builders whose options the Vite setup reads. */
export const ANGULAR_BUILD_BUILDERS = [
  '@angular/build:application',
  '@angular-devkit/build-angular:application',
];
/** The Angular CLI development servers that the Vite development server replaces. */
export const ANGULAR_SERVE_BUILDERS = [
  '@angular/build:dev-server',
  '@angular-devkit/build-angular:dev-server',
];
/**
 * The name the Angular build target is kept under. Angular builders such as `unit-test` and
 * `extract-i18n` read the options of a build target, which the Vite target no longer has.
 */
export const ANGULAR_BUILD_TARGET = 'build-angular';

const CACHE_IGNORE = '/.cache/ng-doc';

/**
 * Findings as Markdown list items, each once: analyze reports some once per configuration.
 * @param findings - The findings to list.
 */
function list(findings: MigrationFinding[]): string[] {
  return [...new Set(findings.map((finding) => `- \`${finding.subject}\`: ${finding.message}`))];
}

/**
 * Sets up the Vite engine for a project that builds with Angular's application builder: the
 * `vite.config.mjs` of the project, the `vite-application` and `vite-dev-server` targets, the
 * server entry, the dependencies and `.gitignore`. It reads the build target the same way
 * `migrate-to-vite` reads a legacy one, and refuses what that schematic refuses. `ng add` runs it
 * after the NgDoc styles, assets and providers are in place.
 * @param options - The schematic options.
 */
export function viteSetup(options: NgDocViteSetupSchema): Rule {
  return (tree: Tree, context: SchematicContext) => {
    let projects: WorkspaceProject[];
    try {
      projects = readWorkspaceProjects(tree);
    } catch (error) {
      throw new SchematicsException(
        `[NGDOC_VITE_SETUP_WORKSPACE] The workspace file could not be read (${error instanceof Error ? error.message : error}). Fix it, or run \`ng add @ng-doc/add --engine legacy\`.`,
      );
    }
    const project = projects.find((item) => item.name === options.project);
    if (!project) {
      throw new SchematicsException(
        `[NGDOC_VITE_SETUP_PROJECT] Project "${options.project}" does not exist.`,
      );
    }
    const build = project.targets['build'];
    const builder = targetBuilder(build);
    if (builder === VITE_APPLICATION_BUILDER) {
      context.logger.info(
        `Project "${project.name}" already builds with the Vite engine (${VITE_APPLICATION_BUILDER}); nothing to change.`,
      );
      return;
    }
    const blocked = (findings: MigrationFinding[]): never => {
      throw new SchematicsException(
        [
          `[NGDOC_VITE_SETUP_BLOCKED] Project "${project.name}" was not set up with the Vite engine, and no file of the project was changed:`,
          ...list(findings),
          'Resolve these and run `ng add @ng-doc/add` again, or run `ng add @ng-doc/add --engine legacy` to use the legacy builders.',
        ].join('\n'),
      );
    };
    if (!build || !ANGULAR_BUILD_BUILDERS.includes(builder ?? '')) {
      blocked([
        {
          level: 'blocking',
          subject: 'build',
          message: build
            ? `uses \`${builder ?? 'no builder'}\`, not Angular's application builder (${ANGULAR_BUILD_BUILDERS.map((name) => `\`${name}\``).join(', ')}), whose options the Vite engine reads.`
            : 'does not exist.',
        },
      ]);
    }

    const serveTarget = project.targets['serve'];
    const serveName = ANGULAR_SERVE_BUILDERS.includes(targetBuilder(serveTarget) ?? '')
      ? 'serve'
      : undefined;
    const plan = analyzeProject(
      tree,
      project,
      'build',
      serveName,
      { keptBuildName: ANGULAR_BUILD_TARGET },
      builderKey(build as WorkspaceTarget),
    );
    const configFile = plan.setup.configFile;
    if (tree.exists(configFile)) {
      plan.findings.push({
        level: 'blocking',
        subject: configFile,
        message: 'already exists. Move it away first.',
      });
    }
    if (project.targets[ANGULAR_BUILD_TARGET]) {
      plan.findings.push({
        level: 'blocking',
        subject: ANGULAR_BUILD_TARGET,
        message: 'already exists, so the Angular build target cannot be kept under that name.',
      });
    }
    if (serveTarget && !serveName) {
      plan.findings.push({
        level: 'manual',
        subject: 'serve',
        message: `uses \`${targetBuilder(serveTarget) ?? 'no builder'}\` and was left as it is. Use \`${VITE_DEV_SERVER_BUILDER}\` with \`"configFile": "${configFile}"\` to serve the site.`,
      });
    }
    const blocking = plan.findings.filter((finding) => finding.level === 'blocking');
    if (blocking.length) blocked(blocking);

    // The Angular target keeps its options for the builders that read them; the Vite targets take
    // the names `ng build` and `ng serve` run.
    writeTarget(tree, project, ANGULAR_BUILD_TARGET, plan.build.legacy, 'build');
    writeTarget(tree, project, 'build', plan.build.next);
    if (plan.serve) writeTarget(tree, project, 'serve', plan.serve.next);
    // The serve target is replaced by the Vite development server, which has no build target: an
    // explicit `buildTarget` in its options must not turn it back into an Angular target.
    const retargets = plan.retargets.filter((retarget) => retarget.target !== serveName);
    for (const retarget of retargets) {
      const target = project.targets[retarget.target];
      if (target) {
        writeTarget(tree, project, retarget.target, withBuildTarget(target, retarget.after));
      }
    }

    const changes: string[] = [
      `- \`build\` runs \`${VITE_APPLICATION_BUILDER}\`${plan.serve ? ` and \`serve\` runs \`${VITE_DEV_SERVER_BUILDER}\`` : ''}, with \`${configFile}\`.`,
      `- The Angular build options stay in \`${ANGULAR_BUILD_TARGET}\`${
        retargets.length
          ? `, which ${retargets.map((retarget) => `\`${retarget.target}\``).join(', ')} now read${retargets.length === 1 ? 's' : ''}`
          : ''
      }.`,
    ];
    tree.create(
      configFile,
      renderNgDocViteConfig(plan.setup, [
        `The Vite configuration of the NgDoc site "${project.name}", generated by \`ng add @ng-doc/add\``,
        'from its build target. The vite-application and vite-dev-server targets run it. Edit it freely.',
      ]),
    );
    changes.push(`- Created \`${configFile}\`.`);

    // The server entry waits for NgDoc content before a page is prerendered.
    const serverEntry = plan.setup.server;
    if (serverEntry && tree.exists(serverEntry)) {
      const text = tree.readText(serverEntry);
      const wrapped = wrapServerEntry(serverEntry, text);
      if (wrapped === undefined) {
        plan.findings.push({
          level: 'manual',
          subject: serverEntry,
          message:
            "Wrap the default export with `withNgDocContentReady` from '@ng-doc/app/helpers', so prerendering waits for the page content.",
        });
      } else if (wrapped !== text) {
        tree.overwrite(serverEntry, wrapped);
        changes.push(
          `- Wrapped the default export of \`${serverEntry}\` with \`withNgDocContentReady\`.`,
        );
      }
    }

    if (!tree.exists('.gitignore')) {
      plan.findings.push({
        level: 'manual',
        subject: '.gitignore',
        message: `does not exist; keep \`${CACHE_IGNORE}\` out of version control.`,
      });
    } else if (addGitIgnoreLine(tree, CACHE_IGNORE)) {
      changes.push(`- Added \`${CACHE_IGNORE}\` to \`.gitignore\`.`);
    }

    // A generated folder the engine did not write stops the first build (OUTPUT_UNOWNED_COLLISION).
    const output = tree.getDir(plan.setup.outputRoot);
    if (output.subfiles.length || output.subdirs.length) {
      plan.findings.push({
        level: 'manual',
        subject: plan.setup.outputRoot,
        message:
          'already exists. Delete it before the first build: the Vite engine refuses files it did not write.',
      });
    }

    const { added, mismatches } = addNgDocViteDependencies(tree);
    for (const [name, version] of Object.entries(added)) {
      changes.push(`- Added \`${name}@${version}\` to \`devDependencies\`.`);
    }
    for (const mismatch of mismatches) {
      changes.push(
        `- \`${mismatch.name}\` is \`${mismatch.found}\`; the Vite engine is tested with \`${mismatch.expected}\`.`,
      );
    }
    if (Object.keys(added).length && !options.skipInstall) {
      context.addTask(new NodePackageInstallTask());
    }

    const manual = plan.findings.filter((finding) => finding.level === 'manual');
    // Options without any effect under Vite; `assets`, for example, is only partly dropped.
    const used = new Set(
      plan.findings
        .filter((finding) => finding.level !== 'dropped')
        .map((finding) => finding.subject),
    );
    const dropped = plan.findings
      .filter(
        (finding) =>
          finding.level === 'dropped' &&
          finding.subject.startsWith('build.') &&
          !used.has(finding.subject),
      )
      .map((finding) => `\`${finding.subject}\``);
    context.logger.info(
      [`Project "${project.name}" builds with the NgDoc Vite engine:`, ...changes].join('\n'),
    );
    if (dropped.length) {
      context.logger.info(
        `Build options the Vite engine does not use: ${[...new Set(dropped)].join(', ')}.`,
      );
    }
    if (manual.length) {
      context.logger.warn(['Needs a manual change:', ...list(manual)].join('\n'));
    }
  };
}
