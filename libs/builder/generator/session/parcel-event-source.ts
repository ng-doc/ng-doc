import * as parcel from '@parcel/watcher';
import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import type { Diagnostic, FileChange, FileEventSource } from '../contracts';
import { WATCHER_RESCAN } from './watch-signals';

/**
 * The @parcel/watcher 2.5 messages for a lossy but still subscribed native watcher. Only the macOS
 * FSEvents backend reports one (three variants, pinned by a guard test); inotify overflow is
 * silent and the Windows buffer overflow ends the subscription, so both stay as they were.
 */
const RESCAN_MESSAGE = /must be re-scanned/i;

/**
 * IDE and OS metadata that is never a generator input but is rewritten constantly: the watched
 * root's JetBrains `.idea/` directory and macOS Finder `.DS_Store` files. Recorded inputs are
 * TypeScript sources, `ng-doc.{page,category,api}.ts` descriptions and the files they include.
 * `.vscode/` is not ignored: VS Code keeps its frequently written state outside the workspace.
 */
export const METADATA_IGNORE: readonly string[] = ['.idea', '**/.DS_Store'];

/**
 * The backend a subscription names when its options name none. Without a name, @parcel/watcher on
 * Linux first probes for Watchman: it runs `watchman get-sockname` through `popen`, and when
 * Watchman is missing the reply fails to parse before `pclose`, so the probe's shell is never
 * reaped. The host then keeps a zombie child in its process group until it exits, and a
 * supervisor that waits for that group to empty after `dispose` finds it there. Naming inotify,
 * the backend the probe falls back to, skips the probe. macOS selects FSEvents before any probe.
 * @param platform The platform to choose for.
 * @returns The backend to name, or `undefined` to keep @parcel/watcher's choice.
 */
export function nativeWatcherBackend(
  platform: NodeJS.Platform = process.platform,
): parcel.BackendType | undefined {
  return platform === 'linux' || platform === 'android' ? 'inotify' : undefined;
}

/** Each subscription owns a native watcher. The adapter must ignore its generated output roots. */
export function createParcelEventSource(
  root: string,
  options: parcel.Options = {},
  subscribe: typeof parcel.subscribe = parcel.subscribe,
): FileEventSource {
  const directory = resolve(root);
  return {
    async subscribe(
      listener: (events: FileChange[]) => unknown,
      onError: (diagnostic: Diagnostic) => void,
    ) {
      // Parcel reports canonical paths (notably /private/var for macOS /var). Preserve the
      // caller's root spelling in emitted paths so dependency matching uses the same namespace.
      const physicalDirectory = await realpath(directory);
      const requested = options.ignore ?? ['**/node_modules/**'];
      const ignore = [
        ...requested,
        ...METADATA_IGNORE.filter((pattern) => !requested.includes(pattern)),
      ].map((pattern) => {
        // @parcel/watcher 2.6 also accepts regular expressions; they match as given.
        if (typeof pattern !== 'string' || !isAbsolute(pattern)) return pattern;
        const path = relative(directory, pattern);
        return path !== '..' &&
          !path.startsWith('../') &&
          !path.startsWith('..\\') &&
          !isAbsolute(path)
          ? join(physicalDirectory, path)
          : pattern;
      });
      const backend = options.backend ?? nativeWatcherBackend();
      let active = true;
      let disposing: Promise<void> | undefined;
      const report = (diagnostic: Diagnostic): void => {
        if (!active) return;
        try {
          void Promise.resolve(onError(diagnostic)).catch(() => {});
        } catch {
          /* Never throw from a native watcher callback. */
        }
      };
      const listenerFailed = (error: unknown): void =>
        report({
          code: 'WATCHER_LISTENER_FAILED',
          severity: 'error',
          stage: 'host',
          message: error instanceof Error ? error.message : 'Watcher listener failed',
        });
      const native = await subscribe(
        physicalDirectory,
        (error, events) => {
          if (!active) return;
          if (error) {
            // @parcel/watcher reports a lossy native queue (FSEvents UserDropped/KernelDropped or
            // "Too many events") as a callback error delivered together with the surviving
            // events, and keeps the subscription alive. Only a backend failure ends it.
            const rescan = RESCAN_MESSAGE.test(error.message);
            report({
              code: rescan ? WATCHER_RESCAN : 'WATCHER_ERROR',
              severity: rescan ? 'warning' : 'error',
              stage: 'host',
              message: rescan
                ? `${error.message} Re-observing every recorded input.`
                : error.message,
              source: { path: directory.replace(/\\/g, '/') },
            });
            if (!rescan) return;
          }
          const changes = (events ?? [])
            .filter((event) => {
              const path = relative(physicalDirectory, resolve(event.path));
              // The watched root itself never changes while it is watched: FSEvents reports it
              // with coalesced flags (for example alongside dropped events) as a bogus create.
              return (
                path !== '' &&
                path !== '..' &&
                !path.startsWith('../') &&
                !path.startsWith('..\\') &&
                !isAbsolute(path)
              );
            })
            .map((event) => ({
              kind: event.type,
              path: join(directory, relative(physicalDirectory, resolve(event.path))).replace(
                /\\/g,
                '/',
              ),
            }));
          if (changes.length) {
            try {
              void Promise.resolve(listener(changes)).catch(listenerFailed);
            } catch (error) {
              listenerFailed(error);
            }
          }
        },
        { ...options, ...(backend ? { backend } : {}), ignore },
      );
      return {
        dispose() {
          active = false;
          return (disposing ??= Promise.resolve().then(() => native.unsubscribe()));
        },
      };
    },
  };
}
