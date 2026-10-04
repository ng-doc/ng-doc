import { version as resolvedViteVersion } from 'vite';

/**
 * The Vite releases the Vite engine supports: Vite 8 from 8.3.0, the release `@angular/build` 22.2
 * itself runs on. The engine bundles a patched Analog 2.8.0 and relies on Vite's hot-update,
 * watcher, optimizer and module-runner APIs, which are tested on this major; Vite 7 and earlier
 * are refused.
 *
 * `ng-doc.viteEngine.vite` in `libs/builder/package.json`, which the setup schematics install, must
 * equal it (a test compares them). The builder's optional `vite` peer dependency is wider, Analog's
 * own peer range: before the migration adds `vite`, the Vite at the application's root is the one
 * its `@angular/build` brings (7.3 for Angular 22.0, 8.1 for 22.1), and npm refuses to install a
 * package whose peer range excludes it, even an optional one and even for the legacy engine, which
 * never loads Vite. The check below enforces the range where it matters, when the Vite engine
 * starts.
 */
export const SUPPORTED_VITE_RANGE = '^8.3.0';

const SUPPORTED_MAJOR = 8;
const MINIMUM_MINOR = 3;

/**
 * Whether a Vite version is inside {@link SUPPORTED_VITE_RANGE}. A prerelease of a supported
 * release (8.4.0-beta.1) is accepted; one of 8.3.0 itself is not.
 * @param version - The Vite version.
 */
export function isSupportedViteVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (major !== SUPPORTED_MAJOR || minor < MINIMUM_MINOR) return false;
  return !(match[4] && minor === MINIMUM_MINOR && patch === 0);
}

/**
 * Fails when the Vite engine runs on a Vite outside {@link SUPPORTED_VITE_RANGE}.
 * @param found - The running Vite's version; by default the one NgDoc resolves.
 */
export function assertSupportedViteVersion(found: string | undefined = resolvedViteVersion): void {
  if (found && isSupportedViteVersion(found)) return;
  throw new Error(
    `[NGDOC_VITE_VERSION] The NgDoc Vite engine requires vite ${SUPPORTED_VITE_RANGE}, ` +
      `but vite ${found || '(unknown version)'} is running. Install a supported release in the ` +
      `application's devDependencies: npm i -D vite@${SUPPORTED_VITE_RANGE}. ` +
      'The legacy builders (@ng-doc/builder:application and dev-server) do not use Vite.',
  );
}
