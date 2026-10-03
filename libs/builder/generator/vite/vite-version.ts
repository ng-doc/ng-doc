import { version as resolvedViteVersion } from 'vite';

/**
 * The one Vite version the Vite engine supports. The engine bundles a patched Analog 2.6.3 and works
 * around Vite internals (the bounded close in `bounded-close.ts`, the watcher and optimizer hooks),
 * all of which are tested against exactly this release.
 *
 * The builder's optional `vite` peer dependency is deliberately wider: other packages of an Angular
 * application (Vitest, for example) pull in newer Vite majors, and an exact optional peer would then
 * stop npm from installing NgDoc at all, even for the legacy engine, which never loads Vite. The
 * check below enforces the exact version where it matters, when the Vite engine starts. Keep it
 * equal to `ng-doc.viteEngine.vite` in `libs/builder/package.json`, which the setup schematics
 * install (a test compares them).
 */
export const SUPPORTED_VITE_VERSION = '7.3.5';

/**
 * Fails when the Vite engine runs on another Vite than {@link SUPPORTED_VITE_VERSION}.
 * @param found - The running Vite's version; by default the one NgDoc resolves.
 */
export function assertSupportedViteVersion(found: string | undefined = resolvedViteVersion): void {
  if (found === SUPPORTED_VITE_VERSION) return;
  throw new Error(
    `[NGDOC_VITE_VERSION] The NgDoc Vite engine requires vite ${SUPPORTED_VITE_VERSION}, ` +
      `but vite ${found || '(unknown version)'} is running. Pin it in the application's ` +
      `devDependencies: npm i -D vite@${SUPPORTED_VITE_VERSION}. ` +
      'The legacy builders (@ng-doc/builder:application and dev-server) do not use Vite.',
  );
}
