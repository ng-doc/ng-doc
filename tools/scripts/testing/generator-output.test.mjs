import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_RETRY,
  hostIdentity,
  legacyState,
  ownerState,
  parseLstart,
  processStartTime,
  publishStaged,
  recoverStaging,
  resolveOutputDirectory,
  stagingLocation,
  withRetry,
} from '../generator-output.mjs';

/** `<base>/pkg/generator`: `pkg` plays the package directory (dist/libs/builder), `base` dist/libs. */
async function scratch(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-generator-publish-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const parent = path.join(base, 'pkg');
  return { base, parent, output: path.join(parent, 'generator') };
}

async function put(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

/** Path, type, mode, size and bytes of every entry under `directory`, plus its own inode. */
async function fingerprint(directory) {
  const hash = createHash('sha256');
  const visit = async (relative) => {
    for (const name of (await readdir(path.join(directory, relative))).sort()) {
      const child = path.join(relative, name);
      const info = await lstat(path.join(directory, child));
      hash.update(`${child}\0${info.mode}\0${info.size}\0`);
      if (info.isDirectory()) await visit(child);
      else hash.update(await readFile(path.join(directory, child)));
    }
  };
  await visit('');
  return { tree: hash.digest('hex'), inode: (await stat(directory)).ino };
}

const staging = async (directory) =>
  (await readdir(directory).catch(() => [])).filter((name) => name.includes('.staging-'));
const noSleep = { sleep: async () => {} };
const quiet = () => {
  const warnings = [];
  return { warnings, warn: (message) => warnings.push(message) };
};
const error = (code) => Object.assign(new Error(`injected ${code}`), { code });

/** fs/promises with `rename`/`rm` wrapped by `fault(operation, args, callIndex)` (throw to inject). */
function faultyFs({ rename, rm: remove } = {}) {
  const calls = { rename: 0, rm: 0 };
  return {
    calls,
    fs: {
      ...fsPromises,
      rename: async (from, to) => {
        const index = calls.rename++;
        await rename?.(from, to, index);
        return fsPromises.rename(from, to);
      },
      rm: async (target, options) => {
        const index = calls.rm++;
        await remove?.(target, options, index);
        return fsPromises.rm(target, options);
      },
    },
  };
}

/** Owner options for a pid whose process has since exited (the build crashed or was killed). */
const exited = { alive: () => false };

/**
 * A host identity under which an owner can be proven dead (a boot id and no pid namespaces, as on
 * macOS). Windows reports neither, so on the real host identity no owner is ever provable there and
 * every root is kept; tests of the recovery proof inject this identity to run on every OS.
 */
const PROVABLE = Object.freeze({
  host: os.hostname(),
  boot: 'test-boot',
  pidNamespace: 'host',
  bootedAt: null,
});
const provableHost = { identity: PROVABLE };

async function seedStaging(base, name, owner, previous) {
  const root = path.join(base, name);
  await mkdir(path.join(root, 'output'), { recursive: true });
  if (owner) await put(path.join(root, 'owner.json'), JSON.stringify(owner));
  if (previous)
    for (const [file, text] of Object.entries(previous))
      await put(path.join(root, 'previous', file), text);
  return root;
}

/** An owner record written under {@link PROVABLE}. */
const provableRecord = (output, overrides = {}) =>
  ownerRecord(output, { ...PROVABLE, ...overrides });

function ownerRecord(output, overrides = {}) {
  return {
    format: 'ngdoc-generator-staging-v1',
    target: output,
    token: 'seeded',
    pid: 2147483646,
    started: 'epoch-s:0',
    ...hostIdentity(),
    ...overrides,
  };
}

test('publishes a new output and its sibling files; staging lives outside the package directory', async (t) => {
  const { base, parent, output } = await scratch(t);
  let during;
  const result = await publishStaged(output, async ({ output: staged, sibling, scratch: work }) => {
    during = { staged, work, inBase: await staging(base), inParent: await staging(parent) };
    await put(path.join(staged, 'index.js'), 'v1\n');
    await put(sibling('package.json'), '{"name":"pkg"}\n');
    return 'built';
  });
  assert.equal(result, 'built');
  assert.equal(await readFile(path.join(output, 'index.js'), 'utf8'), 'v1\n');
  assert.equal(await readFile(path.join(parent, 'package.json'), 'utf8'), '{"name":"pkg"}\n');
  assert.equal(
    during.inBase.length,
    1,
    'one staging root next to the package directory while building',
  );
  assert.ok(
    during.inBase[0].startsWith(`.pkg.generator.staging-${process.pid}-`),
    during.inBase[0],
  );
  assert.deepEqual(
    during.inParent,
    [],
    'nothing inside the package directory (npm pack, cp, tree digests)',
  );
  assert.equal(path.dirname(during.work), path.dirname(during.staged));
  assert.deepEqual(await staging(base), []);
  assert.deepEqual(await readdir(parent), ['generator', 'package.json']);
});

test('the owner record names this process, its start time, boot, pid namespace and a token', async (t) => {
  const { output } = await scratch(t);
  let owner;
  await publishStaged(output, async ({ scratch: work }) => {
    owner = JSON.parse(await readFile(path.join(path.dirname(work), 'owner.json'), 'utf8'));
  });
  assert.equal(owner.format, 'ngdoc-generator-staging-v1');
  assert.equal(owner.target, output);
  assert.equal(owner.pid, process.pid);
  assert.match(owner.token, /^[0-9a-f]{32}$/);
  assert.equal(owner.host, os.hostname());
  assert.equal(owner.started, processStartTime(process.pid));
  // Windows reports no boot id or pid namespace, so no owner (not even this live one) is provable
  // there: its roots are kept, never removed.
  assert.equal(ownerState(owner), process.platform === 'win32' ? 'unknown' : 'live');
  assert.equal(ownerState({ ...owner, ...PROVABLE }, provableHost), 'live');
});

test('a successful build replaces the whole output: deleted and renamed files do not survive', async (t) => {
  const { base, parent, output } = await scratch(t);
  await put(path.join(output, 'templates/old-name.nunj'), 'old\n');
  await put(path.join(output, 'templates/kept.nunj'), 'kept v1\n');
  await put(path.join(parent, 'package.json'), 'old manifest\n');
  await put(path.join(parent, 'neighbour/file'), 'untouched\n');
  await publishStaged(output, async ({ output: staged, sibling }) => {
    await put(path.join(staged, 'templates/new-name.nunj'), 'new\n');
    await put(path.join(staged, 'templates/kept.nunj'), 'kept v2\n');
    await put(sibling('package.json'), 'new manifest\n');
  });
  assert.deepEqual((await readdir(path.join(output, 'templates'))).sort(), [
    'kept.nunj',
    'new-name.nunj',
  ]);
  assert.equal(await readFile(path.join(output, 'templates/kept.nunj'), 'utf8'), 'kept v2\n');
  assert.equal(await readFile(path.join(parent, 'package.json'), 'utf8'), 'new manifest\n');
  assert.equal(await readFile(path.join(parent, 'neighbour/file'), 'utf8'), 'untouched\n');
  assert.deepEqual(await staging(base), []);
});

test('a failed build or guard leaves the existing output and siblings byte-identical', async (t) => {
  const { base, parent, output } = await scratch(t);
  await put(path.join(output, 'contracts.js'), 'previous build\n');
  await put(path.join(output, 'build-provenance.json'), '{"sourceDigest":"previous"}\n');
  await put(path.join(output, 'templates/page.nunj'), 'previous template\n');
  await put(path.join(parent, 'package.json'), 'previous manifest\n');
  const before = await fingerprint(parent);
  const outputInode = (await stat(output)).ino;
  let staged;
  await assert.rejects(
    publishStaged(output, async ({ output: directory, sibling }) => {
      staged = directory;
      // Written as a real build would, before its post-bundle guard throws.
      await put(path.join(directory, 'contracts.js'), 'new bundle with a new toolchain digest\n');
      await put(sibling('package.json'), 'new manifest\n');
      throw new Error('Generator bundle inputs missing from sourceDigest: x.ts');
    }),
    /missing from sourceDigest/,
  );
  assert.deepEqual(await fingerprint(parent), before);
  assert.equal((await stat(output)).ino, outputInode, 'the output directory was never renamed');
  assert.ok(staged.startsWith(path.join(base, '.pkg.generator.staging-')), staged);
  await assert.rejects(stat(staged), { code: 'ENOENT' });
  assert.deepEqual(await staging(base), []);
});

test('a declared sibling that was never written fails before the swap', async (t) => {
  const { parent, output } = await scratch(t);
  await put(path.join(output, 'contracts.js'), 'previous\n');
  const before = await fingerprint(parent);
  await assert.rejects(
    publishStaged(output, async ({ output: staged, sibling }) => {
      await put(path.join(staged, 'contracts.js'), 'next\n');
      sibling('package.json');
    }),
    /sibling output was not written: package\.json/,
  );
  assert.deepEqual(await fingerprint(parent), before);
});

test('invalid sibling names are rejected without touching the output', async (t) => {
  const { output } = await scratch(t);
  for (const name of ['../escape', 'a/b', '', 'generator'])
    await assert.rejects(
      publishStaged(output, async ({ sibling }) => sibling(name)),
      /Invalid sibling output name/,
    );
  await assert.rejects(stat(output), { code: 'ENOENT' });
});

test('transient EPERM/EBUSY/EACCES on both renames are retried with a bounded backoff', async (t) => {
  const { base, output } = await scratch(t);
  await put(path.join(output, 'contracts.js'), 'previous\n');
  const { fs, calls } = faultyFs({
    // rename 0,1: target -> previous (EPERM, EBUSY); 2: succeeds; 3,4: staged -> target (EACCES, EPERM).
    rename: (_from, _to, index) => {
      const code = { 0: 'EPERM', 1: 'EBUSY', 3: 'EACCES', 4: 'EPERM' }[index];
      if (code) throw error(code);
    },
  });
  const delays = [];
  await publishStaged(
    output,
    async ({ output: staged }) => put(path.join(staged, 'contracts.js'), 'next\n'),
    {
      fs,
      sleep: async (milliseconds) => delays.push(milliseconds),
    },
  );
  assert.equal(await readFile(path.join(output, 'contracts.js'), 'utf8'), 'next\n');
  assert.equal(calls.rename, 6);
  assert.deepEqual(delays, [50, 100, 50, 100]);
  assert.deepEqual(await staging(base), []);
});

test('a failure to remove the staging root after a successful swap is a warning, not a failure', async (t) => {
  const { base, output } = await scratch(t);
  await put(path.join(output, 'contracts.js'), 'previous\n');
  const { warn, warnings } = quiet();
  const { fs, calls } = faultyFs({
    rm: () => {
      throw error('EBUSY');
    },
  });
  const result = await publishStaged(
    output,
    async ({ output: staged }) => {
      await put(path.join(staged, 'contracts.js'), 'next\n');
      return 'published';
    },
    { fs, warn, ...noSleep, owner: provableHost },
  );
  assert.equal(result, 'published');
  assert.equal(await readFile(path.join(output, 'contracts.js'), 'utf8'), 'next\n');
  assert.equal(calls.rm, DEFAULT_RETRY.attempts, 'bounded retries');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Could not remove the staging root .*EBUSY.*next build removes it/);
  // The leftover belongs to a process that (in a real build) has exited: the next build removes it.
  const [leftover] = await staging(base);
  assert.ok(leftover);
  await publishStaged(
    output,
    async ({ output: staged }) => put(path.join(staged, 'contracts.js'), 'third\n'),
    {
      owner: { ...provableHost, ...exited },
    },
  );
  assert.deepEqual(await staging(base), []);
});

test('a cleanup failure after a failed build does not mask the build error', async (t) => {
  const { output } = await scratch(t);
  const { warn, warnings } = quiet();
  const { fs } = faultyFs({
    rm: () => {
      throw error('ENOTEMPTY');
    },
  });
  await assert.rejects(
    publishStaged(
      output,
      async () => {
        throw new Error('guard failed');
      },
      { fs, warn, ...noSleep },
    ),
    /^Error: guard failed$/,
  );
  assert.match(warnings.join('\n'), /ENOTEMPTY/);
});

test('retries are bounded; a persistent publish failure rolls back and reports the original error', async (t) => {
  const { base, parent, output } = await scratch(t);
  await put(path.join(output, 'contracts.js'), 'previous\n');
  await put(path.join(parent, 'package.json'), 'previous manifest\n');
  const before = await fingerprint(parent);
  const { fs, calls } = faultyFs({
    rename: (from, to) => {
      if (to === output && path.basename(from) === 'output') throw error('EPERM');
    },
  });
  await assert.rejects(
    publishStaged(
      output,
      async ({ output: staged, sibling }) => {
        await put(path.join(staged, 'contracts.js'), 'next\n');
        await put(sibling('package.json'), 'next manifest\n');
      },
      { fs, ...noSleep },
    ),
    { code: 'EPERM', message: 'injected EPERM' },
  );
  assert.equal(
    calls.rename,
    1 + DEFAULT_RETRY.attempts + 1,
    'away, bounded publish attempts, rollback',
  );
  assert.deepEqual(
    { ...(await fingerprint(parent)), inode: undefined },
    { ...before, inode: undefined },
  );
  assert.deepEqual(await staging(base), []);
});

test('non-retryable errors are thrown at once; withRetry gives up after the configured attempts', async () => {
  let runs = 0;
  await assert.rejects(
    withRetry(async () => {
      runs++;
      throw error('EXDEV');
    }, noSleep),
    { code: 'EXDEV' },
  );
  assert.equal(runs, 1);
  runs = 0;
  await assert.rejects(
    withRetry(
      async () => {
        runs++;
        throw error('EBUSY');
      },
      { retry: { attempts: 3, delayMs: 1, maxDelayMs: 1 }, ...noSleep },
    ),
    { code: 'EBUSY' },
  );
  assert.equal(runs, 3);
  assert.equal(await withRetry(async () => 'ok'), 'ok');
});

test('a failed rollback keeps the previous output, reports both errors, and the next build restores it', async (t) => {
  const { base, parent, output } = await scratch(t);
  await put(path.join(output, 'contracts.js'), 'previous build\n');
  const { fs } = faultyFs({
    rename: (from, to) => {
      if (to === output && path.basename(from) === 'output') throw error('EBUSY');
      if (to === output && path.basename(from) === 'previous') throw error('EPERM');
    },
  });
  const { warn, warnings } = quiet();
  const failure = await publishStaged(
    output,
    async ({ output: staged }) => put(path.join(staged, 'contracts.js'), 'next\n'),
    {
      fs,
      warn,
      ...noSleep,
      owner: provableHost,
    },
  ).then(
    () => assert.fail('expected a failure'),
    (reason) => reason,
  );
  assert.ok(failure instanceof AggregateError);
  assert.equal(failure.code, 'ERR_GENERATOR_ROLLBACK_FAILED');
  assert.deepEqual(
    failure.errors.map((item) => item.code),
    ['EBUSY', 'EPERM'],
  );
  assert.equal(failure.cause.code, 'EBUSY', 'the original error is preserved');
  assert.match(failure.message, /preserved at .*previous/);
  const [kept] = await staging(base);
  assert.equal(
    await readFile(path.join(base, kept, 'previous/contracts.js'), 'utf8'),
    'previous build\n',
  );
  assert.match(warnings.join('\n'), /Kept .*previous output/);
  await assert.rejects(stat(output), { code: 'ENOENT' });

  // The failed build's process exits; the next build recovers the output before building, so even
  // a failing next build leaves the previous output in place.
  const recovered = quiet();
  await assert.rejects(
    publishStaged(
      output,
      async () => {
        throw new Error('next build fails');
      },
      { owner: { ...provableHost, ...exited }, warn: recovered.warn },
    ),
    /next build fails/,
  );
  assert.equal(await readFile(path.join(output, 'contracts.js'), 'utf8'), 'previous build\n');
  assert.match(recovered.warnings.join('\n'), /Restored the previous generator output/);
  assert.deepEqual(await staging(base), []);
  assert.deepEqual(await readdir(parent), ['generator']);
});

test('a crash inside the swap window never loses the output, even if the next build fails', async (t) => {
  const { base, output } = await scratch(t);
  // State left by a build killed between rename(target -> previous) and rename(staged -> target).
  await seedStaging(base, '.pkg.generator.staging-2147483646-crash', provableRecord(output), {
    'contracts.js': 'last good\n',
  });
  const { warn, warnings } = quiet();
  await assert.rejects(
    publishStaged(
      output,
      async () => {
        throw new Error('guard');
      },
      { warn, owner: provableHost },
    ),
    /guard/,
  );
  assert.equal(await readFile(path.join(output, 'contracts.js'), 'utf8'), 'last good\n');
  assert.match(warnings.join('\n'), /Restored the previous generator output/);
  assert.deepEqual(await staging(base), [], 'the dead root is removed once the output is back');
});

test('a root holding the only copy is never deleted, even when its owner is provably dead', async (t) => {
  const { base, output } = await scratch(t);
  const root = await seedStaging(
    base,
    '.pkg.generator.staging-2147483646-crash',
    ownerRecord(output),
    { 'contracts.js': 'last good\n' },
  );
  const { warn, warnings } = quiet();
  // The restoring rename fails (e.g. a Windows lock): the root must survive with previous/ inside.
  const { fs } = faultyFs({
    rename: () => {
      throw error('EXDEV');
    },
  });
  const report = await recoverStaging(output, { fs, warn, ...noSleep });
  assert.deepEqual(report, {
    removed: [],
    restored: [],
    kept: ['.pkg.generator.staging-2147483646-crash'],
  });
  assert.equal(await readFile(path.join(root, 'previous/contracts.js'), 'utf8'), 'last good\n');
  assert.match(warnings.join('\n'), /only copy/);
});

test('a legacy root in the package directory is restored from, and removed once provably dead', async (t) => {
  const { parent, output } = await scratch(t);
  const macos = {
    identity: { ...hostIdentity(), pidNamespace: 'host', bootedAt: 1 },
    alive: () => false,
  };
  const legacy = await seedStaging(parent, '.generator.staging-2147483646-old', undefined, {
    'contracts.js': 'legacy good\n',
  });
  const { warn, warnings } = quiet();
  const report = await recoverStaging(output, { warn, owner: macos });
  assert.deepEqual(report, {
    removed: ['.generator.staging-2147483646-old'],
    restored: ['.generator.staging-2147483646-old'],
    kept: [],
  });
  assert.equal(await readFile(path.join(output, 'contracts.js'), 'utf8'), 'legacy good\n');
  await assert.rejects(stat(legacy), { code: 'ENOENT' });
  assert.match(warnings.join('\n'), /Restored/);
  assert.deepEqual(
    await readdir(parent),
    ['generator'],
    'nothing left in the package directory to be packed',
  );

  // Where it cannot be proven dead (pid namespaces, no boot time), it is kept and warned about.
  const kept = await seedStaging(parent, '.generator.staging-2147483646-linux');
  const linux = await recoverStaging(output, {
    warn,
    owner: { ...macos, identity: { ...macos.identity, pidNamespace: 'pid:[1]' } },
  });
  assert.deepEqual(linux.kept, ['.generator.staging-2147483646-linux']);
  await stat(kept);
});

test('legacy liveness: created before this boot, a dead pid, or a pid that started later is dead', async (t) => {
  const { parent } = await scratch(t);
  const root = await seedStaging(parent, '.generator.staging-42-x');
  const created = Math.floor((await stat(root)).birthtimeMs / 1000);
  const identity = { host: 'h', boot: 'b', pidNamespace: 'host', bootedAt: created - 100 };
  const state = (options) =>
    legacyState(fsPromises, root, 42, {
      identity,
      alive: () => true,
      startTime: () => `epoch-s:${created - 50}`,
      ...options,
    });
  assert.equal(
    await state({}),
    'live',
    'the pid started before the root was created: may be the builder',
  );
  assert.equal(await state({ alive: () => false }), 'dead');
  assert.equal(
    await state({ startTime: () => `epoch-s:${created + 60}` }),
    'dead',
    'the pid was reused after the root was made',
  );
  assert.equal(await state({ startTime: () => null }), 'live');
  assert.equal(
    await state({ identity: { ...identity, bootedAt: created + 10 } }),
    'dead',
    'made before this boot',
  );
  assert.equal(await state({ identity: { ...identity, pidNamespace: 'pid:[1]' } }), 'unknown');
  assert.equal(await state({ identity: { ...identity, bootedAt: null } }), 'unknown');
  assert.equal(
    await legacyState(fsPromises, path.join(parent, 'missing'), 42, { identity }),
    'unknown',
  );
});

test('a sibling that cannot be moved after the swap reports a live output and a stale sibling', async (t) => {
  const { base, parent, output } = await scratch(t);
  await put(path.join(output, 'contracts.js'), 'previous\n');
  // A directory where the manifest goes: rename(file -> directory) fails after the output swap.
  await mkdir(path.join(parent, 'package.json'));
  const failure = await publishStaged(
    output,
    async ({ output: staged, sibling }) => {
      await put(path.join(staged, 'contracts.js'), 'next\n');
      await put(sibling('package.json'), 'next manifest\n');
    },
    noSleep,
  ).then(
    () => assert.fail('expected a failure'),
    (reason) => reason,
  );
  assert.equal(failure.code, 'ERR_GENERATOR_SIBLING_NOT_PUBLISHED');
  assert.equal(failure.published, true);
  assert.match(
    failure.message,
    /was published and is live, but the sibling file\(s\) package\.json \(E\w+\) were not updated/,
  );
  assert.equal(await readFile(path.join(output, 'contracts.js'), 'utf8'), 'next\n');
  assert.ok((await stat(path.join(parent, 'package.json'))).isDirectory());
  assert.deepEqual(await staging(base), []);
});

test('every failed sibling is named, and the ones that could move are moved', async (t) => {
  const { parent, output } = await scratch(t);
  const { fs } = faultyFs({
    rename: (from) => {
      if (path.basename(from) === 'b.json') throw error('EISDIR');
    },
  });
  await assert.rejects(
    publishStaged(
      output,
      async ({ output: staged, sibling }) => {
        await put(path.join(staged, 'index.js'), 'x\n');
        await put(sibling('a.json'), 'a\n');
        await put(sibling('b.json'), 'b\n');
      },
      { fs, ...noSleep },
    ),
    (reason) =>
      reason.code === 'ERR_GENERATOR_SIBLING_NOT_PUBLISHED' &&
      /b\.json \(EISDIR\)/.test(reason.message) &&
      !/a\.json/.test(reason.message),
  );
  assert.equal(await readFile(path.join(parent, 'a.json'), 'utf8'), 'a\n');
});

test('ownership is provable in the same boot and pid namespace; the host name is only a hint', () => {
  const identity = { host: 'h', boot: 'b', pidNamespace: 'n' };
  const record = {
    format: 'ngdoc-generator-staging-v1',
    pid: 42,
    started: 'epoch-s:100',
    host: 'h',
    boot: 'b',
    pidNamespace: 'n',
  };
  const state = (overrides, options = {}) =>
    ownerState(
      { ...record, ...overrides },
      { identity, alive: () => false, startTime: () => 'epoch-s:100', ...options },
    );
  assert.equal(state({}), 'dead');
  assert.equal(state({}, { alive: () => true }), 'live');
  assert.equal(
    state({}, { alive: () => true, startTime: () => 'epoch-s:101' }),
    'dead',
    'the pid was reused',
  );
  assert.equal(
    state({}, { alive: () => true, startTime: () => null }),
    'live',
    'start time unknown: assume live',
  );
  assert.equal(
    state({}, { alive: () => true, startTime: () => 'linux-ticks:100' }),
    'live',
    'different kinds: not comparable',
  );
  assert.equal(
    state({ started: 'Sun Sep 27 11:41:07 2026' }, { alive: () => true }),
    'live',
    'a locale start-time string from an older owner record is never compared',
  );
  assert.equal(
    state({ host: 'renamed-by-the-network' }),
    'dead',
    'a hostname change does not block cleanup',
  );
  assert.equal(state({ host: 'renamed-by-the-network' }, { alive: () => true }), 'live');
  assert.equal(state({ boot: 'other' }), 'unknown', 'another boot, or another machine');
  assert.equal(
    state({ pidNamespace: 'other' }),
    'unknown',
    'a container with its own pid namespace',
  );
  assert.equal(
    state({}, { identity: { ...identity, boot: null } }),
    'unknown',
    'no boot id on this platform',
  );
  assert.equal(state({}, { identity: { ...identity, pidNamespace: null } }), 'unknown');
  assert.equal(state({ format: 'other' }), 'unknown');
  assert.equal(state({ pid: 0 }), 'unknown');
  assert.equal(ownerState(undefined), 'unknown');
});

test("start times are epoch values, independent of the reader's TZ and locale", async (t) => {
  assert.equal(parseLstart('Sun Sep 27 09:41:07 2026    '), Date.UTC(2026, 8, 27, 9, 41, 7) / 1000);
  assert.equal(parseLstart('Sun Sep  7 09:41:07 2026'), Date.UTC(2026, 8, 7, 9, 41, 7) / 1000);
  for (const text of ['Sun 27 Sep 11:41:18 2026', 'So 27 Sep 11:41:18 2026', '', 'garbage'])
    assert.equal(parseLstart(text), null, text);
  // ps output is parsed under LC_ALL=C/TZ=UTC whatever the caller's environment says.
  let seen;
  assert.equal(
    processStartTime(1, {
      platform: 'darwin',
      run: (_c, _a, options) => ((seen = options.env), 'Thu Jan  1 00:01:00 1970\n'),
    }),
    'epoch-s:60',
  );
  assert.deepEqual([seen.LC_ALL, seen.TZ], ['C', 'UTC']);
  assert.equal(
    processStartTime(1, { platform: 'darwin', run: () => 'So 27 Sep 11:41:18 2026' }),
    null,
  );
  assert.equal(processStartTime(1, { platform: 'win32' }), null);
  if (process.platform === 'win32') return;
  const probe = `import('${new URL('../generator-output.mjs', import.meta.url).href}').then((m) => process.stdout.write(String(m.processStartTime(${process.pid}))))`;
  const read = (env) =>
    execFileSync(process.execPath, ['-e', probe], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
  const values = [
    {},
    { TZ: 'UTC' },
    { TZ: 'Pacific/Kiritimati' },
    { LC_ALL: 'en_GB.UTF-8' },
    { LC_ALL: 'de_DE.UTF-8', TZ: 'America/New_York' },
  ].map(read);
  assert.match(values[0], /^(epoch-s|linux-ticks):\d+$/);
  assert.deepEqual(new Set(values).size, 1, JSON.stringify(values));
});

test('a real child process is live while it runs, dead once it exits, and a reused pid is dead', async (t) => {
  if (!hostIdentity().boot) return t.skip('no boot id on this platform');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], {
    stdio: 'ignore',
  });
  t.after(() => child.kill('SIGKILL'));
  await new Promise((resolve) => child.once('spawn', resolve));
  const record = {
    format: 'ngdoc-generator-staging-v1',
    pid: child.pid,
    started: processStartTime(child.pid),
    ...hostIdentity(),
  };
  assert.ok(record.started);
  assert.equal(ownerState(record), 'live');
  assert.equal(
    ownerState({ ...record, started: record.started.replace(/\d+$/, '0') }),
    'dead',
    'same pid, other process',
  );
  child.kill('SIGKILL');
  await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(ownerState(record), 'dead');
});

test('recovery removes only provably dead roots of this output', async (t) => {
  const { base, output } = await scratch(t);
  const dead = await seedStaging(
    base,
    '.pkg.generator.staging-2147483646-dead',
    provableRecord(output),
  );
  const renamedHost = await seedStaging(
    base,
    '.pkg.generator.staging-2147483646-renamed',
    provableRecord(output, { host: `${PROVABLE.host}-other` }),
  );
  const live = await seedStaging(
    base,
    `.pkg.generator.staging-${process.pid}-live`,
    provableRecord(output, { pid: process.pid, started: processStartTime(process.pid) }),
  );
  const otherBoot = await seedStaging(
    base,
    '.pkg.generator.staging-2147483646-reboot',
    provableRecord(output, { boot: 'another-boot' }),
  );
  const unowned = await seedStaging(base, '.pkg.generator.staging-2147483646-unowned');
  const otherTarget = await seedStaging(
    base,
    '.pkg.generator.staging-2147483646-moved',
    provableRecord(path.join(base, 'elsewhere')),
  );
  const otherOutput = await seedStaging(
    base,
    '.pkg.other.staging-2147483646-abc',
    provableRecord(output),
  );
  const unrelated = await seedStaging(
    base,
    '.pkg.generator.staging-notapid',
    provableRecord(output),
  );
  const { warn, warnings } = quiet();
  const report = await recoverStaging(output, { warn, owner: provableHost });
  assert.deepEqual(report.removed.sort(), [
    '.pkg.generator.staging-2147483646-dead',
    '.pkg.generator.staging-2147483646-renamed',
  ]);
  assert.deepEqual(report.restored, []);
  assert.deepEqual(report.kept.sort(), [
    '.pkg.generator.staging-2147483646-moved',
    '.pkg.generator.staging-2147483646-reboot',
    '.pkg.generator.staging-2147483646-unowned',
  ]);
  for (const directory of [dead, renamedHost])
    await assert.rejects(stat(directory), { code: 'ENOENT' });
  for (const directory of [live, otherBoot, unowned, otherTarget, otherOutput, unrelated])
    await stat(directory);
  assert.equal(warnings.length, 3);
  for (const message of warnings) assert.match(message, /cannot be proven dead/);
});

test("a staging root whose owner record is no longer this build's is not removed", async (t) => {
  const { base, output } = await scratch(t);
  const { warn, warnings } = quiet();
  await publishStaged(
    output,
    async ({ output: staged, scratch: work }) => {
      await put(path.join(staged, 'index.js'), 'x\n');
      await writeFile(
        path.join(path.dirname(work), 'owner.json'),
        JSON.stringify(ownerRecord(output, { token: 'someone else' })),
      );
    },
    { warn },
  );
  assert.equal((await staging(base)).length, 1);
  assert.match(warnings.join('\n'), /not this build's/);
});

test('the output directory comes from --outdir, then NGDOC_GENERATOR_OUT_DIR, then the default', () => {
  // Native absolute paths: on Windows `/workspace` resolves to `<drive>:\workspace`.
  const root = path.resolve('/workspace');
  const scratchDirectory = path.resolve('/scratch/gen');
  assert.equal(
    resolveOutputDirectory([], {}, root, 'dist/libs/builder/generator'),
    path.join(root, 'dist', 'libs', 'builder', 'generator'),
  );
  assert.equal(
    resolveOutputDirectory([], { NGDOC_GENERATOR_OUT_DIR: scratchDirectory }, root, 'dist/x'),
    scratchDirectory,
  );
  assert.equal(
    resolveOutputDirectory(
      ['--outdir', 'tmp/gen'],
      { NGDOC_GENERATOR_OUT_DIR: scratchDirectory },
      root,
      'dist/x',
    ),
    path.join(root, 'tmp', 'gen'),
  );
  for (const argv of [['--outdir'], ['tmp/gen'], ['--out', 'x'], ['--outdir', '']])
    assert.throws(() => resolveOutputDirectory(argv, {}, root, 'dist/x'), /Usage/);
});

test('staging sits beside the package directory, named after it and the output', () => {
  assert.deepEqual(stagingLocation('/repo/dist/libs/builder/generator'), {
    directory: '/repo/dist/libs',
    prefix: '.builder.generator.staging-',
  });
  assert.throws(() => stagingLocation('/generator'), /filesystem root/);
});
