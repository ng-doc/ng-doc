import {
  Rule,
  SchematicContext,
  SchematicsException,
  Tree,
  workflow,
} from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import { execFileSync } from 'child_process';
import { posix } from 'path';

import {
  analyzeProject,
  findLegacyTargets,
  LEGACY_BUILD_BUILDERS,
  LEGACY_SERVE_BUILDERS,
  MigrationFinding,
  MigrationPlan,
} from './analyze';
import { renderReport } from './report';
import { NgDocMigrateToViteSchema } from './schema';
import {
  addGitIgnoreLine,
  addNgDocViteDependencies,
  DependencyMismatch,
  findOutdatedAngular,
  hashContent,
  outdatedAngularText,
} from './setup/dependencies';
import { wrapServerEntry } from './setup/source';
import { VITE_APPLICATION_BUILDER, VITE_DEV_SERVER_BUILDER } from './setup/targets';
import { renderNgDocViteConfig } from './setup/vite-config';
import {
  builderKey,
  parseTargetString,
  readWorkspaceProjects,
  renameTarget,
  targetBuilder,
  updateTarget,
  withBuildTarget,
  WorkspaceProject,
  WorkspaceTarget,
  writeTarget,
} from './setup/workspace';
import {
  backupPath,
  deleteFolder,
  MigrationState,
  readState,
  reportPath,
  serializeState,
  stateFolder,
  writeFile,
} from './state';

const CACHE_IGNORE = '/.cache/ng-doc';

/** The configuration files Vite (and Vitest, after its own) looks for in a folder, in its order. */
const VITE_DEFAULT_CONFIGS = [
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
  'vite.config.cjs',
  'vite.config.mts',
  'vite.config.cts',
];

/** The name of NgDoc's Vite configuration when the project folder already has a `vite.config.*`. */
export const NGDOC_VITE_CONFIG = 'vite.ng-doc.config.mjs';

/** The Vite configuration file of a migration, and the project's own ones it sits next to. */
interface ViteConfigChoice {
  file: string;
  /** Default-named configurations in the same folder that stay the project's own. */
  kept: string[];
}

/**
 * Picks the file NgDoc's Vite configuration is written to.
 *
 * Vite and Vitest run without `--config` load the first default name they find in a folder
 * (`vite.config.{js,mjs,ts,cjs,mts,cts}`; Vitest after its own `vitest.config.*`), so a new
 * `vite.config.mjs` next to a project's `vite.config.mts` (often its unit-test setup) would take
 * its place. When the folder has one, NgDoc's configuration gets a name neither tool looks for,
 * and the Vite targets name it in `configFile`, which the builders pass to Vite explicitly.
 * A second run keeps the file the first run chose, which the Vite build target names.
 * @param tree - The workspace tree.
 * @param project - The project as it is now.
 * @param state - The state of an earlier run.
 * @param requested - The `--vite-config` option.
 */
function chooseViteConfig(
  tree: Tree,
  project: WorkspaceProject,
  state: MigrationState | undefined,
  requested: string | undefined,
): ViteConfigChoice {
  const defaultsIn = (folder: string) =>
    VITE_DEFAULT_CONFIGS.map((name) => posix.join(folder, name)).filter((file) =>
      tree.exists(file),
    );
  if (requested) return { file: requested, kept: [] };
  const configured = state ? project.targets[state.build.name]?.options?.['configFile'] : undefined;
  const existing = defaultsIn(project.root);
  const file =
    typeof configured === 'string'
      ? configured
      : posix.join(project.root, existing.length ? NGDOC_VITE_CONFIG : 'vite.config.mjs');
  return {
    file,
    kept: posix.basename(file) === NGDOC_VITE_CONFIG ? defaultsIn(posix.dirname(file)) : [],
  };
}

/**
 * The other default-named Vite configurations next to a file the user named with `--vite-config`.
 * @param tree - The workspace tree.
 * @param configFile - The configuration file to create, workspace-relative.
 */
function otherViteConfigs(tree: Tree, configFile: string): string[] {
  if (!VITE_DEFAULT_CONFIGS.includes(posix.basename(configFile))) return [];
  const folder = posix.dirname(configFile);
  return VITE_DEFAULT_CONFIGS.map((name) => posix.join(folder, name)).filter(
    (file) => file !== configFile && tree.exists(file),
  );
}

/** Rewrites the `buildTarget` references of a serve target from one build target name to another. */
function renameBuildTarget(
  target: WorkspaceTarget,
  project: string,
  from: string,
  to: string,
): WorkspaceTarget {
  const rewrite = (options: WorkspaceTarget['options']) => {
    const reference = options?.['buildTarget'];
    const parsed = typeof reference === 'string' ? parseTargetString(reference) : undefined;
    if (!options || !parsed || parsed.target !== from) return options;
    if (parsed.project && parsed.project !== project) return options;
    const configuration = parsed.configuration ? `:${parsed.configuration}` : '';
    return { ...options, buildTarget: `${parsed.project}:${to}${configuration}` };
  };
  return {
    ...target,
    ...(target.options ? { options: rewrite(target.options) } : {}),
    ...(target.configurations
      ? {
          configurations: Object.fromEntries(
            Object.entries(target.configurations).map(([name, value]) => [name, rewrite(value)]),
          ),
        }
      : {}),
  };
}

function selectProject(
  tree: Tree,
  projects: WorkspaceProject[],
  name: string | undefined,
): WorkspaceProject {
  if (!projects.length) {
    throw new SchematicsException(
      '[NGDOC_MIGRATE_WORKSPACE] No angular.json or project.json was found. Run the schematic in an Angular CLI or Nx workspace.',
    );
  }
  if (name) {
    const project = projects.find((item) => item.name === name);
    if (!project)
      throw new SchematicsException(`[NGDOC_MIGRATE_PROJECT] Project "${name}" does not exist.`);
    return project;
  }
  const candidates = projects.filter(
    (project) => findLegacyTargets(project).build || readState(tree, project.name),
  );
  if (candidates.length === 1) return candidates[0];
  throw new SchematicsException(
    candidates.length
      ? `[NGDOC_MIGRATE_PROJECT] Several projects use NgDoc (${candidates
          .map((project) => project.name)
          .join(', ')}). Pass --project.`
      : '[NGDOC_MIGRATE_PROJECT] No project builds with @ng-doc/builder:application. Pass --project.',
  );
}

/**
 * The project as it was before the migration: the legacy targets under their original names and
 * the retargeted options restored. Analyzing it again plans exactly what the first run did.
 */
function beforeMigration(project: WorkspaceProject, state: MigrationState): WorkspaceProject {
  const targets = { ...project.targets };
  const buildLegacy = targets[state.build.legacy];
  if (buildLegacy) {
    targets[state.build.name] = buildLegacy;
    delete targets[state.build.legacy];
  }
  const serveLegacy = state.serve ? targets[state.serve.legacy] : undefined;
  if (state.serve && serveLegacy) {
    targets[state.serve.name] = renameBuildTarget(
      serveLegacy,
      project.name,
      state.build.legacy,
      state.build.name,
    );
    delete targets[state.serve.legacy];
  }
  for (const retarget of state.retargets) {
    const target = targets[retarget.target];
    if (!target) continue;
    targets[retarget.target] = withBuildTarget(target, retarget.before);
  }
  return { ...project, targets };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** The hash of a target's definition, independent of key order and layout. */
function hashTarget(target: WorkspaceTarget): string {
  return hashContent(JSON.stringify(canonical(target)));
}

/**
 * Legacy targets kept as `<name>-legacy` next to a Vite target, or next to a target whose
 * configuration file exists: the project was migrated, even when its migration state is gone.
 */
function migratedWithoutState(tree: Tree, project: WorkspaceProject): string[] {
  return Object.keys(project.targets).filter((name) => {
    const builder = targetBuilder(project.targets[name]) ?? '';
    if (!name.endsWith('-legacy')) return false;
    if (!LEGACY_BUILD_BUILDERS.includes(builder) && !LEGACY_SERVE_BUILDERS.includes(builder)) {
      return false;
    }
    const replacement = project.targets[name.slice(0, -'-legacy'.length)];
    const configFile = replacement?.options?.['configFile'];
    return (
      [VITE_APPLICATION_BUILDER, VITE_DEV_SERVER_BUILDER].includes(
        targetBuilder(replacement) ?? '',
      ) ||
      (typeof configFile === 'string' && tree.exists(configFile))
    );
  });
}

function gitIsDirty(): boolean {
  try {
    return (
      execFileSync('git', ['status', '--porcelain'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10_000,
      }).trim() !== ''
    );
  } catch {
    return false;
  }
}

function logReport(context: SchematicContext, report: string, blocked: boolean): void {
  const log = blocked
    ? context.logger.error.bind(context.logger)
    : context.logger.info.bind(context.logger);
  log(report);
}

/** The part of the devkit's `BaseWorkflow` (Angular CLI, `nx g`) that announces its phases. */
interface WorkflowLifeCycle {
  lifeCycle?: {
    subscribe(next: (event: workflow.LifeCycleEvent) => void): { unsubscribe(): void };
  };
}

/**
 * Logs the report of a successful migration after the workflow's own file list. The Angular CLI
 * prints one `CREATE`/`UPDATE`/`DELETE` line per file once the tree is committed, at the workflow's
 * `post-tasks-start` (or `end`, in a dry run, which runs no tasks), and the legacy generated folder
 * alone can be hundreds of `DELETE` lines; a report logged from the rule would scroll away above
 * them. The CLI subscribes to the life cycle before the schematic runs, so this subscription runs
 * after its flush. Without a workflow that exposes its life cycle (the schematic test runner), the
 * report is logged at once.
 * @param context - The schematic context.
 * @param lines - The report and any notes after it.
 */
function logReportLast(context: SchematicContext, lines: string[]): void {
  const log = () => lines.forEach((line) => context.logger.info(line));
  const lifeCycle = (context.engine.workflow as WorkflowLifeCycle | null)?.lifeCycle;
  if (typeof lifeCycle?.subscribe !== 'function') {
    log();
    return;
  }
  let logged = false;
  const subscription = lifeCycle.subscribe((event) => {
    if (logged || (event.kind !== 'post-tasks-start' && event.kind !== 'end')) return;
    logged = true;
    log();
    // The subscription may not be assigned yet if a workflow replays an event synchronously.
    queueMicrotask(() => subscription.unsubscribe());
  });
}

/**
 * `ng g @ng-doc/builder:migrate-to-vite`: moves a project from the legacy NgDoc builders to the
 * Vite engine, or back with `--revert`.
 */
export function migrateToVite(options: NgDocMigrateToViteSchema): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const project = selectProject(tree, readWorkspaceProjects(tree), options.project);
    const state = readState(tree, project.name);
    if (options.revert) return revert(tree, context, project, state);
    if (gitIsDirty()) {
      context.logger.warn(
        'The working tree has uncommitted changes. Commit or stash them first, so you can review and undo the migration.',
      );
    }
    return migrate(tree, context, project, state, options);
  };
}

function migrate(
  tree: Tree,
  context: SchematicContext,
  current: WorkspaceProject,
  state: MigrationState | undefined,
  options: NgDocMigrateToViteSchema,
): void {
  const kept = state ? [] : migratedWithoutState(tree, current);
  if (kept.length) {
    context.logger.warn(
      `Project "${current.name}" was already migrated to the Vite engine: ${kept
        .map((name) => `\`${name}\``)
        .join(', ')} keep the legacy builders, but ${stateFolder(current.name)}/state.json is ` +
        'missing. Nothing was changed. To migrate again, restore the original targets first ' +
        '(for example with git); --revert needs the state file.',
    );
    return;
  }
  const project = state ? beforeMigration(current, state) : current;
  const { build, serve } = findLegacyTargets(project);
  if (!build) {
    const buildTarget = Object.values(project.targets).find(
      (target) => targetBuilder(target) === VITE_APPLICATION_BUILDER,
    );
    if (buildTarget) {
      context.logger.info(
        `Project "${project.name}" already builds with the Vite engine (${VITE_APPLICATION_BUILDER}); nothing to migrate.`,
      );
      return;
    }
    const findings: MigrationFinding[] = [
      {
        level: 'blocking',
        subject: 'build',
        message: `uses \`${targetBuilder(buildTarget) ?? 'no builder'}\`, not one of ${LEGACY_BUILD_BUILDERS.map(
          (name) => `\`${name}\``,
        ).join(', ')}. A custom builder has no automatic migration.`,
      },
    ];
    logReport(context, renderReport({ project: project.name, findings }), true);
    throw new SchematicsException(
      `[NGDOC_MIGRATE_BLOCKED] Project "${project.name}" was not migrated.`,
    );
  }

  const viteConfig = chooseViteConfig(tree, current, state, options.viteConfig);
  const plan = analyzeProject(
    tree,
    project,
    build,
    serve,
    {
      viteConfig: viteConfig.file,
      ...(options.rootComponent ? { rootComponent: options.rootComponent } : {}),
    },
    builderKey(project.targets[build]!),
  );
  const configText = renderNgDocViteConfig(plan.setup, [
    `The Vite configuration of the NgDoc site "${project.name}", generated by`,
    '`ng g @ng-doc/builder:migrate-to-vite` from its legacy build target. The vite-application and',
    'vite-dev-server targets run it. Edit it freely; the schematic does not overwrite it.',
  ]);
  const configFile = plan.setup.configFile;
  if (tree.exists(configFile) && !state && tree.readText(configFile) !== configText) {
    plan.findings.push({
      level: 'blocking',
      subject: configFile,
      message: 'already exists. Move it away, or pass `--vite-config` with another file name.',
    });
  }
  // A default name the user asked for next to the project's own configuration: their choice,
  // with a reminder that one of the two now shadows the other for Vite and Vitest run directly.
  const others = state || !options.viteConfig ? [] : otherViteConfigs(tree, configFile);
  if (others.length) {
    plan.findings.push({
      level: 'manual',
      subject: others.join(', '),
      message:
        `already configures Vite in this folder (for example for Vitest). Vite and Vitest load ` +
        `one \`vite.config.*\` per folder, so \`${posix.basename(configFile)}\` next to it ` +
        'takes the place of one of them. Check that the tools of this folder still load the ' +
        'configuration they expect.',
    });
  }
  for (const [name, legacyName] of [
    [plan.build.name, plan.build.legacyName],
    ...(plan.serve ? [[plan.serve.name, plan.serve.legacyName]] : []),
  ]) {
    if (!state && current.targets[legacyName]) {
      plan.findings.push({
        level: 'blocking',
        subject: legacyName,
        message: `already exists, so the \`${name}\` target cannot be kept under that name.`,
      });
    }
  }
  // The Vite engine does not start on an older Angular (NGDOC_VITE_ANGULAR_VERSION).
  for (const outdated of findOutdatedAngular(tree)) {
    plan.findings.push({
      level: 'blocking',
      subject: outdated.name,
      message: outdatedAngularText(outdated),
    });
  }
  if (plan.findings.some((finding) => finding.level === 'blocking')) {
    logReport(context, renderReport({ project: project.name, findings: plan.findings }), true);
    throw new SchematicsException(
      `[NGDOC_MIGRATE_BLOCKED] Project "${project.name}" was not migrated; see the report above.`,
    );
  }

  const next: MigrationState = state
    ? structuredClone(state)
    : {
        schemaVersion: 1,
        project: project.name,
        build: { name: plan.build.name, legacy: plan.build.legacyName },
        ...(plan.serve ? { serve: { name: plan.serve.name, legacy: plan.serve.legacyName } } : {}),
        retargets: [],
        created: {},
        modified: {},
        dependencies: {},
      };

  // Targets: the originals move to `<name>-legacy`, the Vite targets take their names. A second run
  // leaves the targets alone, so edits to the new targets survive it.
  if (!state) {
    applyTargets(tree, current, plan);
    next.retargets = plan.retargets;
    next.targetHashes = Object.fromEntries(
      [plan.build, ...(plan.serve ? [plan.serve] : [])].map((target) => [
        target.name,
        hashTarget(target.next),
      ]),
    );
  }

  // The Vite configuration: created once, never overwritten.
  if (!tree.exists(configFile)) {
    tree.create(configFile, configText);
    next.created[configFile] = hashContent(configText);
  } else if (
    next.created[configFile] &&
    hashContent(tree.readText(configFile)) !== next.created[configFile]
  ) {
    plan.findings.push({
      level: 'dropped',
      subject: configFile,
      message: 'was edited after the migration and was kept as it is.',
    });
  }

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
      modify(tree, next, serverEntry, wrapped);
    }
    if (wrapped !== undefined) {
      plan.findings.push({
        level: 'migrated',
        subject: serverEntry,
        message: 'The default export is wrapped with `withNgDocContentReady`.',
      });
    }
  }

  // The engine's cache folder stays out of version control.
  if (tree.exists('.gitignore')) {
    const before = tree.readText('.gitignore');
    if (addGitIgnoreLine(tree, CACHE_IGNORE)) {
      const after = tree.readText('.gitignore');
      tree.overwrite('.gitignore', before);
      modify(tree, next, '.gitignore', after);
    }
  } else {
    plan.findings.push({
      level: 'manual',
      subject: '.gitignore',
      message: `does not exist; keep \`${CACHE_IGNORE}\` out of version control.`,
    });
  }

  // Dependencies: added once; a mismatch is reported, never changed.
  const { added, mismatches } = addNgDocViteDependencies(tree);
  Object.assign(next.dependencies, added);
  if (Object.keys(added).length && !options.skipInstall)
    context.addTask(new NodePackageInstallTask());

  // The legacy output: the new engine refuses to overwrite files it did not write.
  if (!state && plan.legacyOutput && deleteFolder(tree, plan.legacyOutput) > 0) {
    next.legacyOutputDeleted = true;
  }
  if (!plan.legacyOutput) {
    plan.findings.push({
      level: 'manual',
      subject: 'ngDoc.outDir',
      message: `is not a string literal. Delete \`<outDir>/ng-doc/${project.name}\` once before the first build.`,
    });
  }
  if (plan.legacyOutput) next.generatedFolder = plan.legacyOutput;
  next.cacheFolder = plan.setup.cacheRoot;

  const report = renderReport({
    project: project.name,
    findings: plan.findings,
    configFile,
    targets: Object.fromEntries(
      [next.build, ...(next.serve ? [next.serve] : [])].map((target) => [
        target.name,
        target.legacy,
      ]),
    ),
    created: Object.keys(next.created).sort(),
    keptViteConfigs: viteConfig.kept,
    modified: Object.keys(next.modified).sort(),
    ...(next.legacyOutputDeleted && next.generatedFolder ? { deleted: next.generatedFolder } : {}),
    ...(next.generatedFolder ? { generatedFolder: next.generatedFolder } : {}),
    dependencies: next.dependencies,
    mismatches: mismatches as DependencyMismatch[],
  });
  writeFile(tree, reportPath(project.name), report);
  writeFile(tree, `${stateFolder(project.name)}/state.json`, serializeState(next));
  logReportLast(context, [
    report,
    ...(state
      ? [`Project "${project.name}" was already migrated; missing pieces were added.`]
      : []),
  ]);
}

/** Records a changed file: its original goes to the backup folder once, then the new text is written. */
function modify(tree: Tree, state: MigrationState, file: string, text: string): void {
  const backup = backupPath(state.project, file);
  if (!tree.exists(backup)) tree.create(backup, tree.readText(file));
  tree.overwrite(file, text);
  state.modified[file] = hashContent(text);
}

function applyTargets(tree: Tree, project: WorkspaceProject, plan: MigrationPlan): void {
  // The originals are renamed in place, so they keep the user's text, and the Vite targets are
  // inserted before them under the original names.
  renameTarget(tree, project, plan.build.name, plan.build.legacyName);
  updateTarget(tree, project, plan.build.legacyName, plan.build.legacy);
  writeTarget(tree, project, plan.build.name, plan.build.next, { before: plan.build.legacyName });
  if (plan.serve) {
    const legacyServe = renameBuildTarget(
      plan.serve.legacy,
      project.name,
      plan.build.name,
      plan.build.legacyName,
    );
    renameTarget(tree, project, plan.serve.name, plan.serve.legacyName);
    updateTarget(tree, project, plan.serve.legacyName, legacyServe);
    writeTarget(tree, project, plan.serve.name, plan.serve.next, {
      before: plan.serve.legacyName,
    });
  }
  for (const retarget of plan.retargets) {
    const target = project.targets[retarget.target]!;
    updateTarget(tree, project, retarget.target, withBuildTarget(target, retarget.after));
  }
}

function revert(
  tree: Tree,
  context: SchematicContext,
  project: WorkspaceProject,
  state: MigrationState | undefined,
): void {
  if (!state) {
    throw new SchematicsException(
      `[NGDOC_MIGRATE_REVERT] Project "${project.name}" has no migration state (${stateFolder(project.name)}/state.json); restore it from version control instead.`,
    );
  }
  const targets = [state.build, ...(state.serve ? [state.serve] : [])];
  // Every original target must still exist before anything is written: a revert that restored
  // only some targets would leave the project on neither engine.
  const missing = targets.filter((target) => !project.targets[target.legacy]);
  if (missing.length) {
    throw new SchematicsException(
      `[NGDOC_MIGRATE_REVERT_TARGET] Project "${project.name}" cannot be reverted: ${missing
        .map((target) => `\`${target.legacy}\` (the original \`${target.name}\`)`)
        .join(', ')} no longer exist. Nothing was changed. Restore the targets from version ` +
        'control, then run --revert again.',
    );
  }
  const kept: string[] = [];
  for (const target of targets) {
    const legacy = project.targets[target.legacy]!;
    const current = project.targets[target.name];
    const written = state.targetHashes?.[target.name];
    if (written && (!current || hashTarget(current) !== written)) {
      kept.push(
        `Target \`${target.name}\` was edited after the migration; the original was restored and the edits are gone.`,
      );
    }
    const restored =
      target === state.build
        ? legacy
        : renameBuildTarget(legacy, project.name, state.build.legacy, state.build.name);
    writeTarget(tree, project, target.name, undefined);
    renameTarget(tree, project, target.legacy, target.name);
    updateTarget(tree, project, target.name, restored);
  }
  for (const retarget of state.retargets) {
    const target = project.targets[retarget.target];
    if (!target || target.options?.['buildTarget'] !== retarget.after) {
      kept.push(`\`${retarget.target}.buildTarget\` was changed after the migration and was kept.`);
      continue;
    }
    updateTarget(tree, project, retarget.target, withBuildTarget(target, retarget.before));
  }
  for (const [file, hash] of Object.entries(state.created)) {
    if (!tree.exists(file)) continue;
    if (hashContent(tree.readText(file)) === hash) tree.delete(file);
    else kept.push(`\`${file}\` was edited after the migration and was kept.`);
  }
  for (const [file, hash] of Object.entries(state.modified)) {
    const backup = backupPath(project.name, file);
    if (!tree.exists(backup)) continue;
    if (tree.exists(file) && hashContent(tree.readText(file)) === hash) {
      tree.overwrite(file, tree.readText(backup));
    } else {
      kept.push(
        `\`${file}\` was edited after the migration and was kept; its original is in \`${backup}\`.`,
      );
    }
  }
  // The new engine's output and cache: the legacy builders start clean, and nothing of the new
  // engine is left untracked once `/.cache/ng-doc` leaves .gitignore again.
  if (state.generatedFolder) deleteFolder(tree, state.generatedFolder);
  if (state.cacheFolder) deleteFolder(tree, state.cacheFolder);
  const keepBackups = kept.some((line) => line.includes('backup/'));
  tree.getDir(stateFolder(project.name)).visit((file) => {
    if (!keepBackups || !file.includes('/backup/')) tree.delete(file);
  });
  const lines = [
    `Project "${project.name}" is back on the legacy NgDoc builders.`,
    ...kept.map((line) => `- ${line}`),
    ...Object.entries(state.dependencies).map(
      ([name, version]) =>
        `- \`${name}@${version}\` stays in package.json; remove it if nothing else uses it.`,
    ),
  ];
  context.logger.info(lines.join('\n'));
}
