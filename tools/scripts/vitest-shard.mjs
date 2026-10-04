import path from 'node:path';

// Balanced Vitest shards. Vitest's own `--shard` splits the files by the hash of their path, so a
// few long files can land on one shard. A group that declares `shardWeights` (seconds per test
// file, relative to the Vitest root) is split by weight instead: the longest files first, each to
// the lightest shard. Weights only steer the balance: every file runs in exactly one shard
// whatever they say, and a file without a weight counts as the median weight.

/**
 * Splits `files` into `count` disjoint shards that together hold every file.
 * Deterministic: the same files and weights always give the same shards, in any input order.
 * @param {string[]} files Test files, relative to the Vitest root, with `/` separators.
 * @param {Record<string, number>} weights Seconds per file.
 * @param {number} count Number of shards.
 * @returns {string[][]} The files of each shard, sorted.
 */
export function partition(files, weights, count) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error(`Invalid shard count: ${count}`);
  const known = Object.values(weights)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
  const weightOf = (file) =>
    Number.isFinite(weights[file]) && weights[file] > 0 ? weights[file] : fallback;
  const unique = [...new Set(files)];
  // Longest first; ties by path in code-unit order, so the result never depends on the input order.
  unique.sort((a, b) => weightOf(b) - weightOf(a) || (a < b ? -1 : a > b ? 1 : 0));
  const shards = Array.from({ length: count }, () => ({ load: 0, files: [] }));
  for (const file of unique) {
    let lightest = shards[0];
    for (const shard of shards) if (shard.load < lightest.load) lightest = shard;
    lightest.files.push(file);
    lightest.load += weightOf(file);
  }
  return shards.map((shard) => shard.files.sort());
}

/**
 * A Vitest sequencer whose `shard` uses {@link partition}; sorting stays Vitest's own.
 * @param {new (...args: any[]) => any} BaseSequencer Vitest's `BaseSequencer` (`vitest/node`).
 * @param {Record<string, number>} weights Seconds per test file, relative to the Vitest root.
 */
export function balancedSequencer(BaseSequencer, weights) {
  return class BalancedSequencer extends BaseSequencer {
    async shard(files) {
      const { root, shard } = this.ctx.config;
      const key = (specification) =>
        path.relative(root, specification.moduleId).split(path.sep).join('/');
      const shards = partition(files.map(key), weights, shard.count);
      const mine = new Set(shards[shard.index - 1]);
      return files.filter((specification) => mine.has(key(specification)));
    }
  };
}
