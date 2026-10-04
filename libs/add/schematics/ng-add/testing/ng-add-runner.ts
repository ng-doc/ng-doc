import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { join } from 'path';

/** The `@ng-doc/add` collection. */
export const COLLECTION_PATH: string = join(__dirname, '../../collection.json');

/** The `@ng-doc/builder` collection, whose `vite-setup` schematic `ng add` runs for the Vite engine. */
export const BUILDER_COLLECTION_PATH: string = join(
  __dirname,
  '../../../../builder/schematics/collection.json',
);

/**
 * A runner for the `@ng-doc/add` schematics. `@ng-doc/builder` is registered from its sources, so the
 * specs never run the package that `node_modules` links to a build of it.
 */
export function createRunner(): SchematicTestRunner {
  const runner: SchematicTestRunner = new SchematicTestRunner('schematics', COLLECTION_PATH);

  runner.registerCollection('@ng-doc/builder', BUILDER_COLLECTION_PATH);

  return runner;
}
