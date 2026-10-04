/** @vitest-environment node */

/**
 * The delta commit against the full commit over seeded random commit sequences. A committer with
 * delta commits and one with `delta: false` get the same candidate at every step; their results,
 * output trees and manifest bytes must be identical. The steps add, remove, edit, move and rename
 * outputs (including paths that sort before and after every other one, and distinct paths that
 * `localeCompare` orders as equal), interleave full commits without a base (a production build),
 * inject faults and stale guards, and restart the committers. Fixed seeds; a failure names the
 * seed and step.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ArtifactSnapshot,
  CommitGuard,
  CommitResult,
  FileOutput,
  OutputManifest,
  PageArtifact,
} from '../../contracts';
import { type CommitMutation, TransactionalOutputCommitter } from '..';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** mulberry32 */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type Site = Map<string, Map<string, string>>;

function snapshot(site: Site, revision: string): ArtifactSnapshot {
  const artifacts = [...site].map(([id, outputs]): PageArtifact => {
    const body: PageArtifact = {
      id,
      identity: { projectId: 'project', entryId: id, role: 'page-shell' },
      revision: '',
      fingerprint: {
        schemaVersion: 4,
        compilerVersion: 'compiler',
        toolchainDigest: 'toolchain',
        configurationDigest: 'configuration',
        inputDigest: `input-${id}`,
        keywordDigest: 'keywords',
      },
      dependencies: [],
      content: [],
      exportedKeywords: [],
      usedKeywords: [],
      searchRecords: [],
      routes: [],
      apiList: [],
      outputs: [...outputs].map(
        ([file, content]): FileOutput => ({
          path: file,
          role: 'content',
          encoding: 'utf8',
          content,
          digest: digest(content),
        }),
      ),
      diagnostics: [],
    };
    return { ...body, revision: digest(JSON.stringify(body)) };
  });
  return { projectId: 'project', revision, artifacts, globalKeywords: [], remoteKeywords: [] };
}

/** Every file under `root` with its content; directories and files are read concurrently. */
async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const walk = async (directory: string): Promise<void> => {
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map(async (entry) => {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else result[path.relative(root, file)] = await readFile(file, 'utf8');
      }),
    );
  };
  await walk(root);
  return result;
}

class Arm {
  committer!: TransactionalOutputCommitter;
  previous?: OutputManifest;
  base?: ArtifactSnapshot;
  fault?: CommitMutation;
  /** Runs in this commit's tail, after its outputs are published (a moved clock, an edit). */
  tail?: (root: string) => Promise<void>;
  constructor(
    readonly root: string,
    readonly delta: boolean,
  ) {
    this.restart();
  }
  restart(): void {
    void this.committer?.dispose();
    this.committer = new TransactionalOutputCommitter({
      outputRoot: this.root,
      delta: this.delta,
      beforeMutation: async (operation) => {
        if (operation === this.fault) throw new Error(`injected ${operation} fault`);
        if (operation === 'publish-manifest') await this.tail?.(this.root);
      },
    });
  }
  async commit(
    generation: number,
    candidate: ArtifactSnapshot,
    guard: CommitGuard,
    withBase: boolean,
  ): Promise<CommitResult> {
    const result = await this.committer.commit(
      {
        generation,
        candidate,
        ...(this.previous ? { previous: clone(this.previous) } : {}),
        ...(withBase && this.previous && this.base
          ? { base: { snapshot: this.base, manifest: clone(this.previous) } }
          : {}),
      },
      guard,
      new AbortController().signal,
    );
    if (result.status === 'committed') {
      this.previous = clone(result.manifest);
      this.base = candidate;
    }
    return result;
  }
}

const STEPS = 2000;
const directories = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
const soft = '\u00ad';

async function sequence(seed: number, steps: number) {
  const next = random(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  const deltaRoot = await mkdtemp(path.join(tmpdir(), `ng-doc-s4-random-${seed}-delta-`));
  const fullRoot = await mkdtemp(path.join(tmpdir(), `ng-doc-s4-random-${seed}-full-`));
  roots.push(deltaRoot, fullRoot);
  const arms = [new Arm(deltaRoot, true), new Arm(fullRoot, false)] as const;
  const site: Site = new Map();
  let counter = 0;
  const fresh = (): string => {
    counter += 1;
    const roll = next();
    // Paths that sort before and after every other one, and locale-equal twins.
    if (roll < 0.08) return `0first-${counter}.mjs`;
    if (roll < 0.16) return `zzlast-${counter}.mjs`;
    return `${pick(directories)}/page-${counter}.mjs`;
  };
  const used = () => new Set([...site.values()].flatMap((outputs) => [...outputs.keys()]));
  for (let index = 0; index < 6; index++)
    site.set(
      `a${index}`,
      new Map([
        [fresh(), `content ${index}`],
        [fresh(), `body ${index}`],
      ]),
    );
  const counts = {
    delta: 0,
    full: 0,
    first: 0,
    last: 0,
    afterProduction: 0,
    failed: 0,
    stale: 0,
    tails: 0,
    edits: 0,
    repaired: 0,
  };
  // A moved clock: a commit tail longer than the racy window lets published outputs be recorded
  // as verified; an external in-place edit in such a tail (same size, mtime restored, as
  // `touch -r` does) must still be repaired by the next full commit on both arms.
  let offset = 0;
  const realNow = Date.now.bind(Date);
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
  let repair = false;
  let production = false;

  for (let step = 1; step <= steps; step++) {
    const roll = next();
    const ids = [...site.keys()];
    const owner = pick(ids);
    const outputs = site.get(owner)!;
    if (roll < 0.35 && outputs.size) {
      outputs.set(pick([...outputs.keys()]), `edit ${seed}/${step}`);
    } else if (roll < 0.45) {
      site.set(
        `n${step}`,
        new Map([
          [fresh(), `new ${step}`],
          ...(next() < 0.5 ? [[fresh(), `more ${step}`] as [string, string]] : []),
        ]),
      );
    } else if (roll < 0.52 && site.size > 3) {
      site.delete(owner);
    } else if (roll < 0.6 && outputs.size > 1) {
      const moved = pick([...outputs.keys()]);
      const target = pick(ids.filter((id) => id !== owner));
      if (target) {
        site.get(target)!.set(moved, outputs.get(moved)!);
        outputs.delete(moved);
      }
    } else if (roll < 0.68 && outputs.size) {
      const renamed = pick([...outputs.keys()]);
      outputs.set(fresh(), outputs.get(renamed)!);
      outputs.delete(renamed);
    } else if (roll < 0.7) {
      // A distinct path that `localeCompare` orders as equal to a published one.
      const existing = [...used()].filter((file) => !file.includes(soft) && /page-\d+/.test(file));
      if (existing.length) {
        const twin = pick(existing).replace('page-', `pa${soft}ge-`);
        if (!used().has(twin)) outputs.set(twin, `twin ${step}`);
      }
    } else if (roll < 0.8) {
      for (const [id, files] of site)
        for (const file of [...files.keys()]) if (file.includes(soft)) site.get(id)!.delete(file);
    }
    for (const [id, files] of [...site]) if (!files.size && site.size > 1) site.delete(id);

    const special = next();
    // After an external edit, the next committed commit is full: delta commits leave external
    // edits of unchanged outputs in place by design, so only a full commit is comparable.
    const withBase = !(special < 0.07) && !repair;
    const tail = next();
    const edited =
      tail < 0.04 ? pick([...used()].filter((file) => !file.includes(soft))) : undefined;
    const tailing = tail < 0.25;
    const fault: CommitMutation | undefined =
      special >= 0.07 && special < 0.11
        ? pick(['publish-output', 'publish-manifest', 'stage-write'] as const)
        : undefined;
    const stale = special >= 0.11 && special < 0.13;
    if (special >= 0.13 && special < 0.15) arms.forEach((arm) => arm.restart());
    const candidate = snapshot(site, `s${seed}-${step}`);
    const before = arms[0].previous;
    const results: CommitResult[] = [];
    for (const arm of arms) {
      arm.fault = fault;
      arm.tail = tailing
        ? async (root) => {
            if (edited) {
              const target = path.join(root, edited);
              const reference = `${root}.reference`;
              execFileSync('touch', ['-r', target, reference]);
              await writeFile(target, 'x'.repeat((await readFile(target)).length));
              execFileSync('touch', ['-r', reference, target]);
              await rm(reference);
            }
            offset += 3_000;
          }
        : undefined;
      results.push(await arm.commit(step, candidate, { isCurrent: () => !stale }, withBase));
    }
    const label = `seed ${seed} step ${step}`;
    expect({ label, result: JSON.stringify(results[0]).split(deltaRoot).join('<root>') }).toEqual({
      label,
      result: JSON.stringify(results[1]).split(fullRoot).join('<root>'),
    });
    const [deltaTree, fullTree] = await Promise.all([tree(deltaRoot), tree(fullRoot)]);
    expect({ label, tree: deltaTree }).toEqual({ label, tree: fullTree });
    const telemetry = arms[0].committer.inspect();
    if (results[0].status === 'failed') counts.failed++;
    if (results[0].status === 'stale') counts.stale++;
    if (telemetry?.mode === 'delta') {
      counts.delta++;
      if (production) counts.afterProduction++;
      // A merge that puts a changed output before the first or after the last kept entry.
      if (results[0].status === 'committed' && before) {
        const kept = new Set(
          before.files.map((file) => `${file.ownerId}\0${file.path}\0${file.digest}`),
        );
        const files = results[0].manifest.files;
        const changed = (file: OutputManifest['files'][number]) =>
          !kept.has(`${file.ownerId}\0${file.path}\0${file.digest}`);
        if (files.length > 1 && changed(files[0]) && files.some((file) => !changed(file)))
          counts.first++;
        if (files.length > 1 && changed(files.at(-1)!) && files.some((file) => !changed(file)))
          counts.last++;
      }
    } else if (telemetry) counts.full++;
    if (results[0].status === 'committed') {
      production = !withBase;
      if (!withBase && repair) {
        repair = false;
        counts.repaired++;
      }
      if (tailing) counts.tails++;
      if (edited) {
        repair = true;
        counts.edits++;
      }
    }
    arms.forEach((arm) => (arm.fault = undefined));
  }
  await Promise.all(arms.map((arm) => arm.committer.dispose()));
  clock.mockRestore();
  return counts;
}

describe('delta commit: seeded random differential', () => {
  it.each([[0x5eed01], [0x5eed02], [0x5eed03]])(
    'seed %i: identical to the full commit at every step',
    async (seed) => {
      const counts = await sequence(seed, STEPS);
      // Path accounting: the sequence exercised what it is for. Optionally written to a file.
      const record = process.env.NGDOC_DELTA_RANDOM_COUNTS;
      if (record)
        await appendFile(record, `${JSON.stringify({ seed, steps: STEPS, ...counts })}\n`);
      expect(counts.delta).toBeGreaterThan(STEPS * 0.35);
      expect(counts.first).toBeGreaterThan(0);
      expect(counts.last).toBeGreaterThan(0);
      expect(counts.afterProduction).toBeGreaterThan(0);
      expect(counts.failed).toBeGreaterThan(0);
      expect(counts.stale).toBeGreaterThan(0);
      expect(counts.tails).toBeGreaterThan(0);
      expect(counts.repaired).toBeGreaterThan(0);
    },
    180_000,
  );
});
