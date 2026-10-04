import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';

import { findLegacyTargets } from './analyze';
import { readWorkspaceProjects } from './setup/workspace';

/**
 * The `ng update` note for NgDoc 22: it changes nothing and keeps every project on the legacy
 * builders; for each project that uses them, it prints how to move to the Vite engine.
 */
export function updateNote(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const projects = readWorkspaceProjects(tree).filter(
      (project) => findLegacyTargets(project).build,
    );
    if (!projects.length) return;
    context.logger.info(
      [
        `NgDoc keeps ${projects.map((project) => `"${project.name}"`).join(', ')} on the legacy builders.`,
        'The new engine with the Vite host is opt-in. To preview the migration, run:',
        ...projects.map(
          (project) => `  ng g @ng-doc/builder:migrate-to-vite --project ${project.name} --dry-run`,
        ),
        'The "Migrate to the new engine" page of the NgDoc documentation explains each step.',
      ].join('\n'),
    );
  };
}
