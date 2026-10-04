import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, readlinkSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Atomic publication of a build output directory (the standalone generator runtime).
 *
 * The build writes into a fresh staging root and only then swaps it in with rename(2). A build or
 * guard failure therefore leaves the existing output byte-identical, and a published output never
 * carries files from an earlier build (deleted or renamed templates do not survive).
 *
 * The staging root lives next to the output's parent (the package directory), not inside it:
 * `<grandparent>/.<parent-name>.<output-name>.staging-<pid>-<random>`. It is on the same filesystem
 * (both renames stay atomic), and nothing that copies or packs the package directory (npm pack,
 * `cp dist/libs/builder`, tree digests) can ever see a live or leftover staging root.
 *
 * Layout of a staging root:
 *   owner.json        who owns it: pid, start time, boot id, pid namespace, token (host: a hint)
 *   work/             private scratch space for the build (e.g. its input snapshot)
 *   output/           the new output directory
 *   siblings/<file>   files published next to the output (`<parent>/<file>`), e.g. package.json
 *   previous/         the replaced output, until the staging root is removed
 *
 * Recovery never deletes the only copy of an output: when the output is missing and a staging root
 * holds `previous/` (a build died inside the two-rename window, or a rollback failed), `previous/`
 * is restored first. A staging root is deleted only when its owner is provably dead.
 */

const OWNER_FILE = 'owner.json';
const OWNER_FORMAT = 'ngdoc-generator-staging-v1';
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

/** Bounded backoff for transient Windows failures (antivirus, indexer): about 3.5 s in total. */
export const DEFAULT_RETRY = Object.freeze({ attempts: 8, delayMs: 50, maxDelayMs: 1000 });

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** The generator output directory: `--outdir <dir>`, else NGDOC_GENERATOR_OUT_DIR, else the default. */
export function resolveOutputDirectory(argv, env, root, fallback) {
  if (argv.length === 2 && argv[0] === '--outdir' && argv[1]) return path.resolve(root, argv[1]);
  if (argv.length)
    throw new Error(
      'Usage: node tools/scripts/build-generator.mjs [--outdir <generator-output-directory>]',
    );
  return path.resolve(root, env.NGDOC_GENERATOR_OUT_DIR || fallback);
}

/** Where staging roots for `target` live, and the name prefix that identifies them. */
export function stagingLocation(target) {
  const parent = path.dirname(target);
  const directory = path.dirname(parent);
  if (directory === parent)
    throw new Error(`Generator output must not sit directly under a filesystem root: ${target}`);
  return { directory, prefix: `.${path.basename(parent)}.${path.basename(target)}.staging-` };
}

/** Older build scripts created staging roots inside the package directory, with no owner record. */
const legacyStagingLocation = (target) => ({
  directory: path.dirname(target),
  prefix: `.${path.basename(target)}.staging-`,
});

/** Runs `operation`, retrying transient EPERM/EBUSY/EACCES/ENOTEMPTY failures with a bounded backoff. */
export async function withRetry(operation, { retry = DEFAULT_RETRY, sleep = defaultSleep } = {}) {
  let delay = retry.delayMs;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!RETRYABLE.has(error?.code) || attempt >= retry.attempts) throw error;
      await sleep(delay);
      delay = Math.min(delay * 2, retry.maxDelayMs);
    }
  }
}

function readOr(read, fallback) {
  try {
    return read();
  } catch {
    return fallback;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// `ps -o lstart=` under LC_ALL=C and TZ=UTC: "Sun Sep 27 09:41:07 2026".
const LSTART = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/;

/** Parses a C-locale, UTC `lstart` value to epoch seconds, or null. */
export function parseLstart(text) {
  const match = LSTART.exec(String(text).trim());
  const month = match ? MONTHS.indexOf(match[1]) : -1;
  if (month < 0) return null;
  const [day, hours, minutes, seconds, year] = match.slice(2).map(Number);
  return Math.floor(Date.UTC(year, month, day, hours, minutes, seconds) / 1000);
}

/**
 * The start time of `pid` as an environment-independent token, or null when it cannot be read:
 * `linux-ticks:<n>` (clock ticks since boot, /proc/<pid>/stat field 22) or `epoch-s:<n>` (epoch
 * seconds from `ps -o lstart=`, run with LC_ALL=C and TZ=UTC so the reader's locale and time zone
 * never change the value). Two tokens are compared only when both parse (see sameStart).
 */
export function processStartTime(pid, { platform = process.platform, run = execFileSync } = {}) {
  if (platform === 'linux') {
    return readOr(() => {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const ticks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
      return /^\d+$/.test(ticks ?? '') ? `linux-ticks:${ticks}` : null;
    }, null);
  }
  if (platform === 'win32') return null;
  return readOr(() => {
    const text = run('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, LC_ALL: 'C', LANG: 'C', TZ: 'UTC' },
    });
    const seconds = parseLstart(text);
    return seconds === null ? null : `epoch-s:${seconds}`;
  }, null);
}

const START_TOKEN = /^(linux-ticks|epoch-s):(\d+)$/;

/** true/false when both start tokens parse and are of one kind; null when they cannot be compared. */
export function sameStart(left, right) {
  const [a, b] = [START_TOKEN.exec(left ?? ''), START_TOKEN.exec(right ?? '')];
  if (!a || !b || a[1] !== b[1]) return null;
  return a[2] === b[2];
}

/** Boot time in epoch seconds (macOS kern.boottime), or null. */
function bootEpochSeconds() {
  if (process.platform !== 'darwin') return null;
  return readOr(() => {
    const match = /sec = (\d+)/.exec(
      execFileSync('sysctl', ['-n', 'kern.boottime'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
    return match ? Number(match[1]) : null;
  }, null);
}

let cachedIdentity;
/**
 * What makes a pid meaningful: the boot and the pid namespace. Unknown parts are null. The host
 * name is recorded as a hint only: on macOS it follows the network, so it is never part of a proof.
 */
export function hostIdentity() {
  cachedIdentity ??= {
    host: os.hostname(),
    boot:
      process.platform === 'linux'
        ? readOr(() => readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), null)
        : process.platform === 'darwin'
          ? readOr(
              () =>
                execFileSync('sysctl', ['-n', 'kern.bootsessionuuid'], {
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'ignore'],
                }).trim() || null,
              null,
            )
          : null,
    // macOS has no pid namespaces; on Linux a container has its own.
    pidNamespace:
      process.platform === 'linux'
        ? readOr(() => readlinkSync('/proc/self/ns/pid'), null)
        : process.platform === 'darwin'
          ? 'host'
          : null,
    bootedAt: bootEpochSeconds(),
  };
  return cachedIdentity;
}

const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
};

/**
 * 'dead' only when provable: the owner record was written in this boot and pid namespace (the boot
 * id identifies the machine; the host name is only a hint), and its pid is gone or now belongs to a
 * process with a different start time (both start times must parse to compare). 'live' when that
 * pid still runs and cannot be told apart; 'unknown' otherwise (no or foreign record, another boot
 * or container, a platform without boot ids).
 */
export function ownerState(
  owner,
  { identity = hostIdentity(), alive = pidAlive, startTime = processStartTime } = {},
) {
  if (owner?.format !== OWNER_FORMAT || !Number.isInteger(owner.pid) || owner.pid <= 0)
    return 'unknown';
  if (!identity.boot || owner.boot !== identity.boot) return 'unknown';
  if (!identity.pidNamespace || owner.pidNamespace !== identity.pidNamespace) return 'unknown';
  if (!alive(owner.pid)) return 'dead';
  return sameStart(startTime(owner.pid), owner.started) === false ? 'dead' : 'live';
}

/**
 * A legacy staging root (inside the package directory, no owner record, pid in its name) is
 * provably dead only where there are no pid namespaces (macOS): it was created before this boot, or
 * its pid is gone, or its pid now belongs to a process that started after the root was created.
 */
export async function legacyState(
  fs,
  root,
  pid,
  { identity = hostIdentity(), alive = pidAlive, startTime = processStartTime } = {},
) {
  if (identity.pidNamespace !== 'host' || !identity.bootedAt) return 'unknown';
  const info = await fs.stat(root).catch(() => undefined);
  const created = info && Math.floor(Number(info.birthtimeMs || info.ctimeMs) / 1000);
  if (!created) return 'unknown';
  if (created < identity.bootedAt || !alive(pid)) return 'dead';
  const started = START_TOKEN.exec(startTime(pid) ?? '');
  return started?.[1] === 'epoch-s' && Number(started[2]) > created + 1 ? 'dead' : 'live';
}

async function exists(fs, file) {
  return (await fs.stat(file).catch(() => undefined)) !== undefined;
}

async function readOwner(fs, root) {
  return fs
    .readFile(path.join(root, OWNER_FILE), 'utf8')
    .then(JSON.parse)
    .catch(() => undefined);
}

/**
 * Recovers and removes staging roots for `output` left by builds that are gone.
 * 1. If the output is missing, the first staging root that is not provably live and holds a
 *    `previous/` output is renamed back into place (never deleted).
 * 2. Staging roots whose owner is provably dead are removed, but never while the output is missing
 *    and the root still holds `previous/`.
 * 3. Roots whose ownership cannot be proven are kept, with a warning. Legacy roots inside the
 *    package directory are removed too once provably dead (see legacyState): they would be packed.
 * Returns the names removed, restored and kept.
 */
export async function recoverStaging(output, options = {}) {
  const {
    fs = fsPromises,
    warn = (message) => console.warn(message),
    retry,
    sleep,
    owner: ownerOptions,
  } = options;
  const target = path.resolve(output);
  const roots = [];
  for (const [location, legacy] of [
    [stagingLocation(target), false],
    [legacyStagingLocation(target), true],
  ]) {
    for (const name of await fs.readdir(location.directory).catch(() => [])) {
      if (!name.startsWith(location.prefix) || !/^\d+-./.test(name.slice(location.prefix.length)))
        continue;
      const root = path.join(location.directory, name);
      let state;
      if (legacy)
        state = await legacyState(
          fs,
          root,
          Number(name.slice(location.prefix.length).split('-')[0]),
          ownerOptions,
        );
      else {
        const owner = await readOwner(fs, root);
        state = owner && owner.target !== target ? 'unknown' : ownerState(owner, ownerOptions);
      }
      roots.push({ name, root, state });
    }
  }
  const report = { removed: [], restored: [], kept: [] };
  for (const entry of roots) {
    const previous = path.join(entry.root, 'previous');
    if (entry.state !== 'live' && !(await exists(fs, target)) && (await exists(fs, previous))) {
      try {
        await withRetry(() => fs.rename(previous, target), { retry, sleep });
        report.restored.push(entry.name);
        warn(
          `Restored the previous generator output from an interrupted build: ${previous} -> ${target}`,
        );
      } catch (error) {
        warn(`Could not restore the previous generator output from ${previous}: ${error.message}`);
      }
    }
  }
  for (const entry of roots) {
    if (entry.state === 'live') continue;
    const holdsOnlyCopy =
      !(await exists(fs, target)) && (await exists(fs, path.join(entry.root, 'previous')));
    if (entry.state !== 'dead' || holdsOnlyCopy) {
      report.kept.push(entry.name);
      warn(
        holdsOnlyCopy
          ? `Kept ${entry.root}: it holds the only copy of the previous output (previous/).`
          : `Kept ${entry.root}: its owner cannot be proven dead (another boot, machine or container, or no owner record). Remove it by hand once no build is running.`,
      );
      continue;
    }
    try {
      await withRetry(() => fs.rm(entry.root, { recursive: true, force: true }), { retry, sleep });
      report.removed.push(entry.name);
    } catch (error) {
      report.kept.push(entry.name);
      warn(`Could not remove abandoned staging root ${entry.root}: ${error.message}`);
    }
  }
  return report;
}

const KEEP_STAGING = Symbol('keep staging root');

/**
 * Runs `produce({ output, sibling, scratch })` against a staging root and, if it resolves, swaps
 * the staged output in for `output` and moves each staged sibling to `<parent>/<name>`.
 * - If `produce` throws, nothing outside the staging root is touched.
 * - A failed rollback keeps the staging root (and `previous/`), and reports both errors.
 * - A sibling that cannot be moved after the swap fails with ERR_GENERATOR_SIBLING_NOT_PUBLISHED:
 *   the output is live, the sibling was not updated.
 * - A failure to remove the staging root afterwards is a warning, never the build's result.
 * `options` injects fs, retry, sleep and warn for tests.
 */
export async function publishStaged(output, produce, options = {}) {
  const {
    fs = fsPromises,
    warn = (message) => console.warn(message),
    retry,
    sleep,
    owner: ownerOptions,
  } = options;
  const target = path.resolve(output);
  const parent = path.dirname(target);
  const location = stagingLocation(target);
  await fs.mkdir(parent, { recursive: true });
  await recoverStaging(target, { fs, warn, retry, sleep, owner: ownerOptions });
  const stagingRoot = await fs.mkdtemp(
    path.join(location.directory, `${location.prefix}${process.pid}-`),
  );
  const identity = ownerOptions?.identity ?? hostIdentity();
  const token = randomBytes(16).toString('hex');
  await fs.writeFile(
    path.join(stagingRoot, OWNER_FILE),
    `${JSON.stringify({ format: OWNER_FORMAT, target, token, pid: process.pid, started: processStartTime(process.pid), ...identity }, null, 2)}\n`,
  );
  const staged = path.join(stagingRoot, 'output');
  const siblings = path.join(stagingRoot, 'siblings');
  const scratch = path.join(stagingRoot, 'work');
  const names = new Set();
  const sibling = (name) => {
    if (!name || name !== path.basename(name) || name === path.basename(target))
      throw new Error(`Invalid sibling output name: ${name}`);
    names.add(name);
    return path.join(siblings, name);
  };
  let keep = false;
  try {
    await fs.mkdir(staged);
    await fs.mkdir(siblings);
    await fs.mkdir(scratch);
    const result = await produce({ output: staged, sibling, scratch });
    for (const name of names) {
      if (!(await fs.stat(path.join(siblings, name)).catch(() => undefined))?.isFile())
        throw new Error(`Staged sibling output was not written: ${name}`);
    }
    await swapIn({ fs, retry, sleep, stagingRoot, staged, target, siblings, names });
    return result;
  } catch (error) {
    if (error?.[KEEP_STAGING]) keep = true;
    throw error;
  } finally {
    if (keep)
      warn(`Kept ${stagingRoot}: it holds the previous output; the next build restores it.`);
    else await removeOwnStaging({ fs, warn, retry, sleep, stagingRoot, token });
  }
}

async function removeOwnStaging({ fs, warn, retry, sleep, stagingRoot, token }) {
  const owner = await readOwner(fs, stagingRoot);
  if (owner?.token !== token) {
    warn(`Did not remove ${stagingRoot}: its owner record is not this build's.`);
    return;
  }
  try {
    await withRetry(() => fs.rm(stagingRoot, { recursive: true, force: true }), { retry, sleep });
  } catch (error) {
    warn(
      `Could not remove the staging root ${stagingRoot} (${error.code ?? error.message}); the next build removes it.`,
    );
  }
}

async function swapIn({ fs, retry, sleep, stagingRoot, staged, target, siblings, names }) {
  const previous = path.join(stagingRoot, 'previous');
  const attempt = (operation) => withRetry(operation, { retry, sleep });
  let replaced = true;
  try {
    await attempt(() => fs.rename(target, previous));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    replaced = false;
  }
  try {
    await attempt(() => fs.rename(staged, target));
  } catch (error) {
    if (!replaced) throw error;
    try {
      await attempt(() => fs.rename(previous, target));
    } catch (rollbackError) {
      const failure = new AggregateError(
        [error, rollbackError],
        `Publishing ${target} failed (${error.code ?? error.message}) and restoring the previous output failed too ` +
          `(${rollbackError.code ?? rollbackError.message}). The previous output is preserved at ${previous}; the next build restores it.`,
        { cause: error },
      );
      failure.code = 'ERR_GENERATOR_ROLLBACK_FAILED';
      failure[KEEP_STAGING] = true;
      throw failure;
    }
    throw error;
  }
  const failed = [];
  for (const name of [...names].sort()) {
    try {
      await attempt(() =>
        fs.rename(path.join(siblings, name), path.join(path.dirname(target), name)),
      );
    } catch (error) {
      failed.push({ name, error });
    }
  }
  if (failed.length) {
    const failure = new AggregateError(
      failed.map((item) => item.error),
      `${target} was published and is live, but the sibling file(s) ${failed
        .map((item) => `${item.name} (${item.error.code ?? item.error.message})`)
        .join(
          ', ',
        )} were not updated: ${path.dirname(target)} still holds the previous version. Rerun the build.`,
      { cause: failed[0].error },
    );
    failure.code = 'ERR_GENERATOR_SIBLING_NOT_PUBLISHED';
    failure.published = true;
    throw failure;
  }
}
