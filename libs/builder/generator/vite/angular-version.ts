import { createRequire } from 'node:module';

/**
 * The oldest Angular compiler the Vite engine runs on. The bundled Analog 2.8 picks the
 * `@angular/build` API from the `@angular/compiler-cli` version it finds (`>=22.2.0`), while the
 * builder depends on `@angular/build` 22.2: on Angular 22.0 or 22.1 Analog takes its older path,
 * and linking fails much later with "Hash utility must be initialized".
 *
 * `ng-doc.viteEngine` in `libs/builder/package.json` names the Angular compilers `^22.2.0` (a test
 * compares them), and the setup schematics refuse an older Angular. The builder's own compiler peers
 * stay `>=22.0.0 <23.0.0`: the legacy engine runs on any Angular 22 and does not check it.
 */
export const MINIMUM_ANGULAR_COMPILER = '22.2.0';

const MINIMUM = [22, 2, 0] as const;

/**
 * Whether an `@angular/compiler-cli` version is {@link MINIMUM_ANGULAR_COMPILER} or later. Like
 * Analog, it reads only the major, minor and patch numbers, so a prerelease of 22.2.0 counts.
 * @param version - The `@angular/compiler-cli` version.
 */
export function isSupportedAngularCompilerVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.+-]*)?$/.exec(version);
  if (!match) return false;
  for (let index = 0; index < 3; index++) {
    const part = Number(match[index + 1]);
    if (part !== MINIMUM[index]) return part > MINIMUM[index]!;
  }
  return true;
}

/**
 * The version of the `@angular/compiler-cli` that the bundled Analog loads: the one resolved from
 * NgDoc's own location. Undefined when none can be resolved.
 */
export function resolveAngularCompilerVersion(): string | undefined {
  try {
    const manifest = createRequire(import.meta.url)('@angular/compiler-cli/package.json') as {
      version?: unknown;
    };
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fails when the Vite engine runs with an `@angular/compiler-cli` older than
 * {@link MINIMUM_ANGULAR_COMPILER}, or without one.
 * @param found - The `@angular/compiler-cli` version; by default the one NgDoc resolves.
 */
export function assertSupportedAngularVersion(
  found: string | undefined = resolveAngularCompilerVersion(),
): void {
  if (found && isSupportedAngularCompilerVersion(found)) return;
  throw new Error(
    `[NGDOC_VITE_ANGULAR_VERSION] The NgDoc Vite engine requires Angular 22.2 or later ` +
      `(@angular/compiler-cli >=${MINIMUM_ANGULAR_COMPILER}), but ` +
      `${found ? `@angular/compiler-cli ${found} is installed` : '@angular/compiler-cli is not installed'}. ` +
      'Update Angular: ng update @angular/core@22 @angular/cli@22.',
  );
}
