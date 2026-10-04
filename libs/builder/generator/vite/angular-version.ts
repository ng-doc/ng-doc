import { createRequire } from 'node:module';

/**
 * The first Angular release with the newer `@angular/build` transformer API. The bundled Analog 2.8
 * picks the API it calls from the `@angular/compiler-cli` version (`>=22.2.0` calls
 * `initializeHash()` and passes transform options), but takes the implementation from the
 * `@angular/build` it resolves. When the two packages fall on different sides of this release,
 * linking fails late with "Hash utility must be initialized" or a wrong call signature.
 *
 * The builder therefore takes `@angular/build` as a peer dependency, the application's own copy, and
 * the engine checks at start that the pair agrees.
 */
export const TRANSFORM_OPTIONS_ANGULAR = '22.2.0';

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.+-]*)?$/;

/** The major, minor and patch numbers of a version, as Analog reads them (prereleases count). */
function parse(version: string): [number, number, number] | undefined {
  const match = VERSION.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/** Whether a parsed version is {@link TRANSFORM_OPTIONS_ANGULAR} or later. */
function usesTransformOptions([major, minor, patch]: [number, number, number]): boolean {
  const [lowMajor, lowMinor, lowPatch] = parse(TRANSFORM_OPTIONS_ANGULAR)!;
  if (major !== lowMajor) return major > lowMajor;
  if (minor !== lowMinor) return minor > lowMinor;
  return patch >= lowPatch;
}

/**
 * Whether the bundled Analog can drive this `@angular/build` from this `@angular/compiler-cli`: both
 * versions are valid, of the same major, and on the same side of {@link TRANSFORM_OPTIONS_ANGULAR}.
 * Different patch or minor releases on the same side work, as they do in the Angular CLI.
 * @param compiler - The `@angular/compiler-cli` version.
 * @param build - The `@angular/build` version.
 */
export function isConsistentAngularBuild(compiler: string, build: string): boolean {
  const left = parse(compiler);
  const right = parse(build);
  if (!left || !right || left[0] !== right[0]) return false;
  return usesTransformOptions(left) === usesTransformOptions(right);
}

function resolveVersion(name: string): string | undefined {
  try {
    const manifest = createRequire(import.meta.url)(`${name}/package.json`) as {
      version?: unknown;
    };
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The version of the `@angular/compiler-cli` that the bundled Analog loads: the one resolved from
 * NgDoc's own location. Undefined when none can be resolved.
 */
export function resolveAngularCompilerVersion(): string | undefined {
  return resolveVersion('@angular/compiler-cli');
}

/**
 * The version of the `@angular/build` that the bundled Analog loads, resolved from NgDoc's own
 * location like its `require('@angular/build/private')`. Undefined when none can be resolved.
 */
export function resolveAngularBuildVersion(): string | undefined {
  return resolveVersion('@angular/build');
}

/**
 * Fails when the Vite engine would run with an `@angular/compiler-cli` and an `@angular/build`
 * that the bundled Analog cannot drive together ({@link isConsistentAngularBuild}), or without
 * either of them. This happens when the package manager installs a second `@angular/build` for
 * NgDoc instead of reusing the application's (an override, or a lockfile written before).
 * @param compiler - The `@angular/compiler-cli` version; by default the one NgDoc resolves.
 * @param build - The `@angular/build` version; by default the one NgDoc resolves.
 */
export function assertConsistentAngularBuild(
  compiler: string | undefined = resolveAngularCompilerVersion(),
  build: string | undefined = resolveAngularBuildVersion(),
): void {
  if (compiler && build && isConsistentAngularBuild(compiler, build)) return;
  if (!compiler || !build) {
    const missing = !compiler ? '@angular/compiler-cli' : '@angular/build';
    throw new Error(
      `[NGDOC_VITE_ANGULAR_VERSION] The NgDoc Vite engine needs @angular/compiler-cli and ` +
        `@angular/build of the application's Angular 22, but ${missing} is not installed. ` +
        `Install it in the application's devDependencies: npm i -D ${missing}@22.`,
    );
  }
  throw new Error(
    `[NGDOC_VITE_ANGULAR_VERSION] NgDoc resolves @angular/compiler-cli ${compiler} and ` +
      `@angular/build ${build}, which belong to different Angular releases: the Vite engine ` +
      `drives @angular/build through the compiler's version, so both must be from before ` +
      `${TRANSFORM_OPTIONS_ANGULAR} or both from ${TRANSFORM_OPTIONS_ANGULAR} or later. ` +
      'This usually means a second @angular/build was installed for NgDoc: check with ' +
      '`npm ls @angular/build`, then install the same Angular version for every @angular/* ' +
      'package (ng update @angular/core@22 @angular/cli@22) and reinstall, or deduplicate ' +
      '@angular/build (npm dedupe, an override or a resolution).',
  );
}
