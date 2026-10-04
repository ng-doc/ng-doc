import { SchematicsException, Tree } from '@angular-devkit/schematics';
import { posix } from 'path';

import { Retarget } from './analyze';

/**
 * What a migration changed, kept next to the report so that `--revert` can undo exactly that and
 * a second run can tell its own files from files the user wrote. Everything is plain, sorted JSON,
 * so the same migration always writes the same bytes.
 */
export interface MigrationState {
  schemaVersion: 1;
  project: string;
  /** The build target, and the name its original was kept under. */
  build: { name: string; legacy: string };
  /** The serve target, and the name its original was kept under. */
  serve?: { name: string; legacy: string };
  retargets: Retarget[];
  /** Files the migration created, with the SHA-256 of the content it wrote. */
  created: { [file: string]: string };
  /** Files the migration changed, with the SHA-256 of the content it wrote; originals are in `backup/`. */
  modified: { [file: string]: string };
  /** Dependencies the migration added to package.json. */
  dependencies: { [name: string]: string };
  /** The generated folder the legacy engine wrote and the new engine owns. */
  generatedFolder?: string;
  /** Whether the migration deleted the legacy engine's files in `generatedFolder`. */
  legacyOutputDeleted?: boolean;
  /** The new engine's cache folder, deleted by `--revert`. */
  cacheFolder?: string;
  /** Target name to the hash of the Vite target the migration wrote, to tell later edits apart. */
  targetHashes?: { [name: string]: string };
}

/** The folder of a project's migration state, report and backups. */
export function stateFolder(project: string): string {
  return posix.join('.ng-doc-migration', project);
}

export function statePath(project: string): string {
  return posix.join(stateFolder(project), 'state.json');
}

export function reportPath(project: string): string {
  return posix.join(stateFolder(project), 'report.md');
}

/** The backup of a changed file; `.bak`, so no compiler, linter or test runner picks it up. */
export function backupPath(project: string, file: string): string {
  return `${posix.join(stateFolder(project), 'backup', file)}.bak`;
}

export function readState(tree: Tree, project: string): MigrationState | undefined {
  const file = statePath(project);
  if (!tree.exists(file)) return undefined;
  const invalid = (reason: string) =>
    new SchematicsException(
      `[NGDOC_MIGRATE_STATE] ${file} ${reason}. Restore it from version control. To migrate again ` +
        `without it, restore the original targets first (for example with git), then delete ` +
        `${stateFolder(project)}; --revert needs this file.`,
    );
  let state: MigrationState;
  try {
    state = JSON.parse(tree.readText(file)) as MigrationState;
  } catch {
    throw invalid('is not valid JSON');
  }
  if (
    !state ||
    state.schemaVersion !== 1 ||
    state.project !== project ||
    typeof state.build?.name !== 'string' ||
    typeof state.build?.legacy !== 'string'
  ) {
    throw invalid(`does not describe a migration of "${project}"`);
  }
  return {
    ...state,
    retargets: state.retargets ?? [],
    created: state.created ?? {},
    modified: state.modified ?? {},
    dependencies: state.dependencies ?? {},
  };
}

function sorted<T>(record: { [key: string]: T }): { [key: string]: T } {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}

export function serializeState(state: MigrationState): string {
  return `${JSON.stringify(
    {
      schemaVersion: state.schemaVersion,
      project: state.project,
      build: state.build,
      ...(state.serve ? { serve: state.serve } : {}),
      retargets: [...state.retargets].sort((left, right) => (left.target < right.target ? -1 : 1)),
      created: sorted(state.created),
      modified: sorted(state.modified),
      dependencies: sorted(state.dependencies),
      ...(state.generatedFolder ? { generatedFolder: state.generatedFolder } : {}),
      ...(state.legacyOutputDeleted ? { legacyOutputDeleted: true } : {}),
      ...(state.cacheFolder ? { cacheFolder: state.cacheFolder } : {}),
      ...(state.targetHashes ? { targetHashes: sorted(state.targetHashes) } : {}),
    },
    null,
    2,
  )}\n`;
}

/** Writes a file, creating or overwriting it; a no-op when the content is already the same. */
export function writeFile(tree: Tree, file: string, content: string): void {
  if (!tree.exists(file)) tree.create(file, content);
  else if (tree.readText(file) !== content) tree.overwrite(file, content);
}

/** Deletes every file under a folder of the tree. */
export function deleteFolder(tree: Tree, folder: string): number {
  let count = 0;
  tree.getDir(folder).visit((file) => {
    tree.delete(file);
    count++;
  });
  return count;
}
