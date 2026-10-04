import { JsonArray, JsonObject, JsonValue } from '@angular-devkit/core';
import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import {
  ProjectDefinition,
  TargetDefinition,
  updateWorkspace,
  WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';

import { Schema } from '../schema';
import { getProject } from '../utils/get-project';

/**
 * The `maximumError` of the `initial` budget that the legacy setup gives a new application. The
 * NgDoc runtime alone is larger than the 1 MB that `ng new` allows, so a new application would fail
 * its first production build.
 */
export const NG_DOC_INITIAL_BUDGET = '5mb';

/** The `maximumError` of the `initial` budget that `ng new` writes. */
const NG_NEW_INITIAL_BUDGET: number = 1024 ** 2;

const UNITS: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };

/**
 * The size of a budget value in bytes, or undefined when it is not an absolute size (a percentage).
 * @param value - A budget value such as `1MB` or `500kB`.
 */
export function budgetBytes(value: JsonValue | undefined): number | undefined {
  const match: RegExpExecArray | null =
    typeof value === 'string' ? /^\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?\s*$/i.exec(value) : null;

  return match ? Number(match[1]) * UNITS[(match[2] ?? 'b').toLowerCase()] : undefined;
}

/**
 * Raises the `maximumError` of the `initial` budgets of the build target from the `ng new` default
 * (1 MB) to {@link NG_DOC_INITIAL_BUDGET}. A budget the project set itself, warnings and other
 * budgets are kept. The Vite engine has no budgets, and a project that already used NgDoc chose its
 * own, so only the legacy setup of a project new to NgDoc runs this step.
 * @param options - The `ng add` options.
 */
export function raiseInitialBudget(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    return updateWorkspace((workspace: WorkspaceDefinition) => {
      const logger = context.logger.createChild('raise-initial-budget');
      const project: ProjectDefinition | undefined = getProject(options, workspace);
      const build: TargetDefinition | undefined = project?.targets.get('build');
      const raised: string[] = [];

      for (const [name, configuration] of [
        ['options', build?.options],
        ...Object.entries(build?.configurations ?? {}),
      ] as Array<[string, Record<string, JsonValue | undefined> | undefined]>) {
        const budgets: JsonArray | undefined = configuration?.['budgets'] as JsonArray | undefined;

        if (!configuration || !Array.isArray(budgets)) {
          continue;
        }

        const before: number = raised.length;
        const next: JsonArray = budgets.map((budget: JsonValue) => {
          const entry = budget as JsonObject;
          const current: number | undefined = budgetBytes(entry['maximumError']);

          if (entry['type'] !== 'initial' || current !== NG_NEW_INITIAL_BUDGET) {
            return budget;
          }

          raised.push(`${name}: ${entry['maximumError']}`);

          return { ...entry, maximumError: NG_DOC_INITIAL_BUDGET };
        });

        // The array is replaced, not edited in place, so the workspace writer sees the change; an
        // unchanged one is left alone, so a second run writes nothing.
        if (raised.length > before) {
          configuration['budgets'] = next;
        }
      }

      if (raised.length) {
        context.logger.info(`[INFO]: Budgets`);
        logger.info(
          `🔄 Raised the "initial" budget error to ${NG_DOC_INITIAL_BUDGET} (was ${raised.join(', ')}): the NgDoc runtime is larger than the Angular CLI default.`,
        );
      }
    });
  };
}
