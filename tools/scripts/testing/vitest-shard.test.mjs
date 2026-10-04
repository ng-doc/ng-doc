import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { balancedSequencer, partition } from '../vitest-shard.mjs';

const files = Array.from({ length: 23 }, (_, index) => `generator/area/file-${index}.vitest.ts`);
/** mulberry32 */
const random = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

test('every file runs in exactly one shard, for any weights and counts', () => {
  const next = random(7);
  for (let round = 0; round < 200; round++) {
    const subset = files.filter(() => next() < 0.7);
    const weights = Object.fromEntries(
      subset.filter(() => next() < 0.6).map((file) => [file, Math.floor(next() * 500)]),
    );
    const count = 1 + Math.floor(next() * 6);
    const shards = partition(subset, weights, count);
    assert.equal(shards.length, count);
    const all = shards.flat();
    assert.equal(all.length, subset.length, 'no file twice');
    assert.deepEqual([...all].sort(), [...subset].sort(), 'no file missing');
  }
});

test('the split depends on the files and weights only, not on their order', () => {
  const weights = { [files[0]]: 300, [files[1]]: 120, [files[2]]: 120, [files[3]]: 5 };
  const shards = partition(files, weights, 4);
  assert.deepEqual(partition([...files].reverse(), weights, 4), shards);
  assert.deepEqual(partition([...files, files[3]], weights, 4), shards, 'duplicates count once');
});

test('the longest files go first, each to the lightest shard', () => {
  const weights = { a: 10, b: 9, c: 8, d: 3, e: 2, f: 1 };
  assert.deepEqual(partition(Object.keys(weights), weights, 2), [
    ['a', 'd', 'e', 'f'],
    ['b', 'c'],
  ]);
  // A file without a weight counts as the median of the known weights.
  assert.deepEqual(partition(['a', 'b', 'x'], { a: 10, b: 4, c: 6 }, 2), [['a'], ['b', 'x']]);
  // Without any weight every file counts the same.
  assert.deepEqual(partition(['c', 'a', 'b'], {}, 2), [['a', 'c'], ['b']]);
  assert.deepEqual(partition(['a'], {}, 3), [['a'], [], []]);
  for (const count of [0, -1, 1.5, Number.NaN]) assert.throws(() => partition(['a'], {}, count));
});

test('the sequencer keeps the files of its own shard', async () => {
  class Base {
    constructor(ctx) {
      this.ctx = ctx;
    }
  }
  const root = path.join(path.sep, 'workspace', 'libs');
  const specifications = files.map((file) => ({ moduleId: path.join(root, ...file.split('/')) }));
  const weights = { [files[4]]: 400, [files[5]]: 100 };
  const seen = [];
  for (let index = 1; index <= 3; index++) {
    const Sequencer = balancedSequencer(Base, weights);
    const sequencer = new Sequencer({ config: { root, shard: { index, count: 3 } } });
    const mine = await sequencer.shard(specifications);
    assert.ok(mine.every((specification) => specifications.includes(specification)));
    assert.deepEqual(
      mine
        .map((specification) =>
          path.relative(root, specification.moduleId).split(path.sep).join('/'),
        )
        .sort(),
      partition(files, weights, 3)[index - 1],
    );
    seen.push(...mine);
  }
  assert.equal(seen.length, specifications.length);
  assert.equal(new Set(seen).size, specifications.length);
});
